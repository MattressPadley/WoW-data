/**
 * Seasonal data system — loads upgrade tracks and ilvl mappings from YAML,
 * bootstraps new seasons by probing Wowhead tooltips with wago-derived bonus IDs.
 */

import yaml from "js-yaml";
import { mkdir } from "node:fs/promises";
import { getCachedCsv, parseCsv, indexByMulti, type Row } from "./wago.ts";

const SEASONS_DIR = "seasons";

// --- Types ---

export interface UpgradeTrack {
  min_ilvl: number;
  max_ilvl: number;
  ranks: number;
}

export interface BossRankRule {
  positions: number[];
  rank: number;
}

export interface KeyRangeEntry {
  key_range: [number, number];
  track: string;
  rank: number;
}

export interface CrestRangeEntry {
  key_range: [number, number];
  crest: string;
}

export interface DungeonTrackEntry {
  track: string;
  rank: number;
}

export interface MythicPlusIlvlResult {
  end_of_dungeon: { ilvl: number; track: string; rank: number; upgrade_range: { min: number; max: number; ranks: number } };
  vault: { ilvl: number; track: string; rank: number; upgrade_range: { min: number; max: number; ranks: number } };
  crest?: string;
}

export interface SeasonData {
  name: string;
  slug: string;
  expansion: string;
  patch: string;
  tracks: Record<string, UpgradeTrack>;
  track_ranks: Record<string, number[]>;
  raid_difficulty_track: Record<string, string>;
  boss_rank_rules: BossRankRule[];
  crest_suffix: string;
  tier_token_prefixes?: Record<string, string>;
  keystone_dungeons?: { id: number; name: string; min_item_id?: number }[];
  dungeon_difficulty_track?: Record<string, DungeonTrackEntry>;
  mythic_plus_end_of_dungeon?: KeyRangeEntry[];
  mythic_plus_vault?: KeyRangeEntry[];
  mythic_plus_crests?: CrestRangeEntry[];
  delve_end_of_run?: KeyRangeEntry[];
  delve_vault?: KeyRangeEntry[];
}

interface BootstrapQuery {
  difficulty: string;
  bonus_list_id: string;
  rank: number;
  parsed_ilvl: number;
  parsed_track: string;
}

interface BootstrapLog {
  bootstrapped_at: string;
  sample_item_id: number;
  queries: BootstrapQuery[];
}

// --- Difficulty → ItemContext (for wago DB2 tree walk) ---

const DIFFICULTY_CONTEXT: Record<string, number> = {
  lfr: 4,
  normal: 3,
  heroic: 5,
  mythic: 6,
};

// --- Public API ---

/** Load season data from YAML. If no slug, reads current.yaml for the active season. */
export async function loadSeason(slug?: string): Promise<SeasonData> {
  if (!slug) {
    const currentPath = `${SEASONS_DIR}/current.yaml`;
    const currentText = await Bun.file(currentPath).text();
    const current = yaml.load(currentText) as { slug: string };
    slug = current.slug;
  }
  const seasonPath = `${SEASONS_DIR}/${slug}/season.yaml`;
  const text = await Bun.file(seasonPath).text();
  return yaml.load(text) as SeasonData;
}

/** Get the display ilvl for a raid item at a given difficulty and boss position (1-indexed). */
export function getDisplayIlvl(season: SeasonData, difficulty: string, bossPosition: number): number {
  const trackName = season.raid_difficulty_track[difficulty.toLowerCase()];
  if (!trackName) throw new Error(`Unknown difficulty: ${difficulty}`);
  const ranks = season.track_ranks[trackName];
  if (!ranks) throw new Error(`No rank data for track: ${trackName}`);
  const rank = getBossRank(season, bossPosition);
  const idx = Math.min(rank - 1, ranks.length - 1);
  return ranks[idx];
}

/** Get the full upgrade range for a difficulty. */
export function getUpgradeRange(season: SeasonData, difficulty: string): {
  track: string;
  min: number;
  max: number;
  ranks: number;
} {
  const trackName = season.raid_difficulty_track[difficulty.toLowerCase()];
  if (!trackName) throw new Error(`Unknown difficulty: ${difficulty}`);
  const track = season.tracks[trackName];
  if (!track) throw new Error(`No track data for: ${trackName}`);
  return { track: trackName, min: track.min_ilvl, max: track.max_ilvl, ranks: track.ranks };
}

/** Determine the starting rank for a boss based on its position in the encounter list. */
export function getBossRank(season: SeasonData, bossPosition: number): number {
  for (const rule of season.boss_rank_rules) {
    if (rule.positions.includes(bossPosition)) return rule.rank;
  }
  // Default: last rule's rank for bosses beyond defined positions
  return season.boss_rank_rules[season.boss_rank_rules.length - 1]?.rank ?? 1;
}

/** Get the display ilvl for a dungeon item at a given non-M+ difficulty. Returns null for normal (no track). */
export function getDungeonIlvl(
  season: SeasonData,
  difficulty: string,
): { ilvl: number; track: string; rank: number; upgrade_range: { min: number; max: number; ranks: number } } | null {
  const entry = season.dungeon_difficulty_track?.[difficulty.toLowerCase()];
  if (!entry) return null;
  const ranks = season.track_ranks[entry.track];
  if (!ranks) return null;
  const idx = Math.min(entry.rank - 1, ranks.length - 1);
  const trackInfo = season.tracks[entry.track];
  return {
    ilvl: ranks[idx],
    track: entry.track,
    rank: entry.rank,
    upgrade_range: { min: trackInfo.min_ilvl, max: trackInfo.max_ilvl, ranks: trackInfo.ranks },
  };
}

/** Find the matching key_range entry for a given key level. */
function findKeyRange(entries: KeyRangeEntry[], keyLevel: number): KeyRangeEntry | undefined {
  return entries.find((e) => keyLevel >= e.key_range[0] && keyLevel <= e.key_range[1]);
}

/** Resolve ilvl info for a M+ key level (end-of-dungeon + vault + crest). */
export function getMythicPlusIlvl(season: SeasonData, keyLevel: number): MythicPlusIlvlResult | null {
  const eodEntries = season.mythic_plus_end_of_dungeon;
  const vaultEntries = season.mythic_plus_vault;
  if (!eodEntries || !vaultEntries) return null;

  const eod = findKeyRange(eodEntries, keyLevel);
  const vault = findKeyRange(vaultEntries, keyLevel);
  if (!eod || !vault) return null;

  const eodRanks = season.track_ranks[eod.track];
  const vaultRanks = season.track_ranks[vault.track];
  if (!eodRanks || !vaultRanks) return null;

  const eodTrack = season.tracks[eod.track];
  const vaultTrack = season.tracks[vault.track];

  let crest: string | undefined;
  if (season.mythic_plus_crests) {
    const crestEntry = season.mythic_plus_crests.find(
      (e) => keyLevel >= e.key_range[0] && keyLevel <= e.key_range[1],
    );
    crest = crestEntry?.crest;
  }

  return {
    end_of_dungeon: {
      ilvl: eodRanks[Math.min(eod.rank - 1, eodRanks.length - 1)],
      track: eod.track,
      rank: eod.rank,
      upgrade_range: { min: eodTrack.min_ilvl, max: eodTrack.max_ilvl, ranks: eodTrack.ranks },
    },
    vault: {
      ilvl: vaultRanks[Math.min(vault.rank - 1, vaultRanks.length - 1)],
      track: vault.track,
      rank: vault.rank,
      upgrade_range: { min: vaultTrack.min_ilvl, max: vaultTrack.max_ilvl, ranks: vaultTrack.ranks },
    },
    crest,
  };
}

export interface DelveIlvlResult {
  end_of_run: { ilvl: number; track: string; rank: number; upgrade_range: { min: number; max: number; ranks: number } };
  vault: { ilvl: number; track: string; rank: number; upgrade_range: { min: number; max: number; ranks: number } };
}

/** Resolve ilvl info for a bountiful delve tier (end-of-run + vault). */
export function getDelveIlvl(season: SeasonData, tier: number): DelveIlvlResult | null {
  const eodEntries = season.delve_end_of_run;
  const vaultEntries = season.delve_vault;
  if (!eodEntries || !vaultEntries) return null;

  const eod = findKeyRange(eodEntries, tier);
  const vault = findKeyRange(vaultEntries, tier);
  if (!eod || !vault) return null;

  const eodRanks = season.track_ranks[eod.track];
  const vaultRanks = season.track_ranks[vault.track];
  if (!eodRanks || !vaultRanks) return null;

  const eodTrack = season.tracks[eod.track];
  const vaultTrack = season.tracks[vault.track];

  return {
    end_of_run: {
      ilvl: eodRanks[Math.min(eod.rank - 1, eodRanks.length - 1)],
      track: eod.track,
      rank: eod.rank,
      upgrade_range: { min: eodTrack.min_ilvl, max: eodTrack.max_ilvl, ranks: eodTrack.ranks },
    },
    vault: {
      ilvl: vaultRanks[Math.min(vault.rank - 1, vaultRanks.length - 1)],
      track: vault.track,
      rank: vault.rank,
      upgrade_range: { min: vaultTrack.min_ilvl, max: vaultTrack.max_ilvl, ranks: vaultTrack.ranks },
    },
  };
}

/** Get just the vault ilvl for a key level (works for key 0 / M0 too). */
export function getMythicPlusVaultIlvl(
  season: SeasonData,
  keyLevel: number,
): { ilvl: number; track: string; rank: number; upgrade_range: { min: number; max: number; ranks: number } } | null {
  const vaultEntries = season.mythic_plus_vault;
  if (!vaultEntries) return null;
  const vault = findKeyRange(vaultEntries, keyLevel);
  if (!vault) return null;
  const ranks = season.track_ranks[vault.track];
  if (!ranks) return null;
  const trackInfo = season.tracks[vault.track];
  return {
    ilvl: ranks[Math.min(vault.rank - 1, ranks.length - 1)],
    track: vault.track,
    rank: vault.rank,
    upgrade_range: { min: trackInfo.min_ilvl, max: trackInfo.max_ilvl, ranks: trackInfo.ranks },
  };
}

export interface GearTier {
  label: string;
  key_level: number;
  end_of_dungeon_ilvl: number;
  vault_ilvl: number;
  track: string;
  crest?: string;
}

/**
 * Estimate gear tiers (farmable / pushing / cap) based on character ilvl.
 *
 * Logic:
 *   - "farmable": highest key whose end-of-dungeon ilvl is <= your equipped ilvl
 *     (you outgear these drops — you can clear this content comfortably)
 *   - "pushing": farmable + 3 key levels (realistic stretch goal)
 *   - "cap": key level 10 (end-of-dungeon ilvl caps here)
 *
 * Returns up to 3 tiers (deduplicates if they collapse to the same key level).
 */
export function estimateGearTiers(season: SeasonData, equippedIlvl: number): GearTier[] {
  const eodEntries = season.mythic_plus_end_of_dungeon;
  if (!eodEntries) return [];

  // Build a sorted list of distinct key levels from the end-of-dungeon table
  const keyLevels: number[] = [];
  for (const entry of eodEntries) {
    keyLevels.push(entry.key_range[0]);
    if (entry.key_range[1] !== entry.key_range[0] && entry.key_range[1] < 99) {
      keyLevels.push(entry.key_range[1]);
    }
  }
  // Add M0 as the base
  keyLevels.unshift(0);
  keyLevels.sort((a, b) => a - b);

  // Find farmable key level: highest key whose end-of-dungeon drop ilvl <= equipped ilvl
  let farmableKey = 0;
  for (const kl of keyLevels) {
    const info = kl === 0
      ? getDungeonIlvl(season, "mythic")
      : getMythicPlusIlvl(season, kl);
    if (!info) continue;
    const dropIlvl = "end_of_dungeon" in info ? info.end_of_dungeon.ilvl : info.ilvl;
    if (dropIlvl <= equippedIlvl) {
      farmableKey = kl;
    } else {
      break;
    }
  }

  // Pushing = farmable + 3, capped at 10
  const pushingKey = Math.min(farmableKey + 3, 10);
  const capKey = 10;

  function buildTier(label: string, keyLevel: number): GearTier | null {
    if (keyLevel === 0) {
      const info = getDungeonIlvl(season, "mythic");
      if (!info) return null;
      // Vault for M0
      const vaultInfo = getMythicPlusVaultIlvl(season, 0);
      return {
        label,
        key_level: 0,
        end_of_dungeon_ilvl: info.ilvl,
        vault_ilvl: vaultInfo?.ilvl ?? info.ilvl,
        track: info.track,
      };
    }
    const info = getMythicPlusIlvl(season, keyLevel);
    if (!info) return null;
    return {
      label,
      key_level: keyLevel,
      end_of_dungeon_ilvl: info.end_of_dungeon.ilvl,
      vault_ilvl: info.vault.ilvl,
      track: info.end_of_dungeon.track,
      crest: info.crest,
    };
  }

  const tiers: GearTier[] = [];
  const seen = new Set<number>();

  const farmable = buildTier("farmable", farmableKey);
  if (farmable) { tiers.push(farmable); seen.add(farmableKey); }

  if (!seen.has(pushingKey)) {
    const pushing = buildTier("pushing", pushingKey);
    if (pushing) { tiers.push(pushing); seen.add(pushingKey); }
  }

  if (!seen.has(capKey)) {
    const cap = buildTier("cap", capKey);
    if (cap) { tiers.push(cap); seen.add(capKey); }
  }

  return tiers;
}

/** Write current.yaml to set the active season. */
export async function setCurrentSeason(slug: string): Promise<void> {
  await Bun.write(`${SEASONS_DIR}/current.yaml`, yaml.dump({ slug }));
}

// --- Bootstrap ---

interface WowheadTooltipResult {
  ilvl: number;
  trackName: string;
  rank: number;
  totalRanks: number;
}

async function queryWowheadTooltip(itemId: number, bonusListId: string): Promise<WowheadTooltipResult> {
  const url = `https://nether.wowhead.com/tooltip/item/${itemId}?bonus=${bonusListId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wowhead tooltip fetch failed: ${res.status} for ${url}`);
  const json = await res.json() as { tooltip: string };
  const html = json.tooltip;

  // Wowhead uses HTML comments before values: <!--ilvl-->233, Upgrade Level: Veteran <!--uindex-->1/6
  const ilvlMatch = html.match(/<!--ilvl-->(\d+)/) ?? html.match(/Item Level (\d+)/);
  const trackMatch = html.match(/(Explorer|Adventurer|Veteran|Champion|Hero|Myth)\s*<!--uindex-->(\d+)\/(\d+)/i)
    ?? html.match(/(Explorer|Adventurer|Veteran|Champion|Hero|Myth) upgrade level (\d+) of (\d+)/i);

  if (!ilvlMatch) throw new Error(`Could not parse ilvl from Wowhead tooltip for item ${itemId} bonus ${bonusListId}`);

  return {
    ilvl: parseInt(ilvlMatch[1], 10),
    trackName: trackMatch?.[1] ?? "Unknown",
    rank: trackMatch ? parseInt(trackMatch[2], 10) : 0,
    totalRanks: trackMatch ? parseInt(trackMatch[3], 10) : 0,
  };
}

/** Walk wago DB2 bonus trees to find bonus list IDs per difficulty and rank for an item. */
async function getBonusListIds(
  itemId: number,
  noCache: boolean,
): Promise<Map<string, { groupId: string; entries: { rank: number; bonusListId: string }[] }>> {
  const [xbtText, btnText, blgeText] = await Promise.all([
    getCachedCsv("ItemXBonusTree", noCache),
    getCachedCsv("ItemBonusTreeNode", noCache),
    getCachedCsv("ItemBonusListGroupEntry", noCache),
  ]);

  const xbt = indexByMulti(parseCsv(xbtText), "ItemID");
  const btn = indexByMulti(parseCsv(btnText), "ParentItemBonusTreeID");
  const blge = indexByMulti(parseCsv(blgeText), "ItemBonusListGroupID");

  const treeRows = xbt.get(String(itemId));
  if (!treeRows?.length) throw new Error(`No bonus tree found for item ${itemId}`);

  const results = new Map<string, { groupId: string; entries: { rank: number; bonusListId: string }[] }>();

  for (const [diffName, context] of Object.entries(DIFFICULTY_CONTEXT)) {
    for (const treeRow of treeRows) {
      const groupId = findBonusListGroupForContext(treeRow.ItemBonusTreeID, context, btn, new Set());
      if (!groupId) continue;

      const rawEntries = blge.get(groupId);
      if (!rawEntries?.length) continue;

      const entries = rawEntries
        .map((e) => ({ rank: parseInt(e.SequenceValue, 10), bonusListId: e.ItemBonusListID }))
        .filter((e) => e.bonusListId && e.bonusListId !== "0")
        .sort((a, b) => a.rank - b.rank);

      results.set(diffName, { groupId, entries });
      break;
    }
  }

  return results;
}

/** Recursively walk bonus tree nodes to find a ChildItemBonusListGroupID for the given context. */
function findBonusListGroupForContext(
  treeId: string,
  context: number,
  btn: Map<string, Row[]>,
  visited: Set<string>,
): string | null {
  if (visited.has(treeId)) return null;
  visited.add(treeId);

  const nodes = btn.get(treeId);
  if (!nodes) return null;

  for (const node of nodes) {
    const nodeContext = parseInt(node.ItemContext, 10);
    const groupId = node.ChildItemBonusListGroupID;

    if (nodeContext === context && groupId && groupId !== "0") {
      return groupId;
    }

    const childTreeId = node.ChildItemBonusTreeID;
    if (childTreeId && childTreeId !== "0") {
      const result = findBonusListGroupForContext(childTreeId, context, btn, visited);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Bootstrap a new season by probing Wowhead tooltips.
 * Requires a raid instance ID to find a sample item for probing.
 */
export async function bootstrapSeason(
  slug: string,
  sampleItemId: number,
  opts: { noCache?: boolean; name?: string; expansion?: string; patch?: string } = {},
): Promise<SeasonData> {
  const noCache = opts.noCache ?? false;

  // Step 1: Get bonus list IDs per difficulty
  console.error(`Finding bonus tree data for item ${sampleItemId}...`);
  const bonusMap = await getBonusListIds(sampleItemId, noCache);

  if (bonusMap.size === 0) {
    throw new Error(`No difficulty bonus data found for item ${sampleItemId}`);
  }

  // Step 2: Query Wowhead for every rank of every difficulty
  const allQueries: BootstrapQuery[] = [];
  const trackData = new Map<string, { trackName: string; ilvls: number[] }>();

  for (const [difficulty, { entries }] of bonusMap) {
    console.error(`Querying Wowhead for ${difficulty} (${entries.length} ranks)...`);
    const ilvls: number[] = [];
    let trackName: string = "Unknown";

    for (const entry of entries) {
      // Rate limit: 50ms between requests
      await new Promise((r) => setTimeout(r, 50));
      const result = await queryWowheadTooltip(sampleItemId, entry.bonusListId);

      allQueries.push({
        difficulty,
        bonus_list_id: entry.bonusListId,
        rank: entry.rank,
        parsed_ilvl: result.ilvl,
        parsed_track: result.trackName,
      });

      // Skip bogus entries (base ilvl leak) and cross-track entries (very rare drops)
      if (result.ilvl < 100) continue;
      if (trackName !== "Unknown" && result.trackName.toLowerCase() !== trackName) continue;

      ilvls.push(result.ilvl);
      if (result.trackName !== "Unknown") trackName = result.trackName.toLowerCase();
    }

    trackData.set(difficulty, { trackName, ilvls });
  }

  // Step 3: Build the track table
  const tracks: Record<string, UpgradeTrack> = {};
  const track_ranks: Record<string, number[]> = {};
  const raid_difficulty_track: Record<string, string> = {};

  for (const [difficulty, { trackName, ilvls }] of trackData) {
    raid_difficulty_track[difficulty] = trackName;
    if (!tracks[trackName]) {
      tracks[trackName] = {
        min_ilvl: ilvls[0],
        max_ilvl: ilvls[ilvls.length - 1],
        ranks: ilvls.length,
      };
      track_ranks[trackName] = ilvls;
    }
  }

  // Derive lower tracks not covered by raid difficulties (adventurer, explorer)
  // Each track starts 13 ilvl below the next, with the same rank count and step pattern
  const lowestTrack = trackData.get("lfr");
  if (lowestTrack && !tracks["adventurer"]) {
    const veteranIlvls = track_ranks[lowestTrack.trackName];
    if (veteranIlvls) {
      const step = veteranIlvls[0] - (veteranIlvls[0] - 13); // 13 below
      const advIlvls = veteranIlvls.map((v) => v - 13);
      tracks["adventurer"] = {
        min_ilvl: advIlvls[0],
        max_ilvl: advIlvls[advIlvls.length - 1],
        ranks: advIlvls.length,
      };
      track_ranks["adventurer"] = advIlvls;
    }
  }

  // Step 4: Build boss rank rules (standard pattern)
  const boss_rank_rules: BossRankRule[] = [
    { positions: [1], rank: 1 },
    { positions: [2, 3], rank: 2 },
    { positions: [4, 5], rank: 3 },
    { positions: [6], rank: 4 },
    { positions: [7, 8, 9, 10], rank: 6 },
  ];

  const season: SeasonData = {
    name: opts.name ?? slug,
    slug,
    expansion: opts.expansion ?? "Unknown",
    patch: opts.patch ?? "Unknown",
    tracks,
    track_ranks,
    raid_difficulty_track,
    boss_rank_rules,
    crest_suffix: "Dawncrest",
  };

  // Step 5: Write YAML files
  const seasonDir = `${SEASONS_DIR}/${slug}`;
  await mkdir(`${seasonDir}/progress`, { recursive: true });
  await Bun.write(`${seasonDir}/season.yaml`, yaml.dump(season, { sortKeys: false, lineWidth: 120 }));

  const log: BootstrapLog = {
    bootstrapped_at: new Date().toISOString(),
    sample_item_id: sampleItemId,
    queries: allQueries,
  };
  await Bun.write(`${seasonDir}/bootstrap-log.yaml`, yaml.dump(log, { sortKeys: false, lineWidth: 120 }));

  // Set as current season
  await setCurrentSeason(slug);

  return season;
}
