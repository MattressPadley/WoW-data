#!/usr/bin/env bun
/**
 * upgrades.ts — Find gear upgrades from all current season content
 *
 * Queries dungeons (heroic, M0, M+) and raids (LFR through mythic) for
 * class-filtered loot, then shows only items from content the character
 * can feasibly complete (drops within --threshold ilvl of equipped avg).
 *
 * Usage (active character):
 *   ./run src/upgrades.ts [--pretty]
 *   ./run src/upgrades.ts --slots head,chest,ring [--pretty]
 *   ./run src/upgrades.ts --all-slots [--pretty]
 *   ./run src/upgrades.ts --min-ilvl 240 [--pretty]
 *   ./run src/upgrades.ts --threshold 30 [--pretty]        # default: 20
 *
 * Usage (explicit character):
 *   ./run src/upgrades.ts --character treepunch [--pretty]
 *   ./run src/upgrades.ts --realm turalyon --name treepunch [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";
import { getArmorType, normalizeSpec } from "./lib/class-meta.ts";
import { resolveCharacter } from "./lib/character.ts";
import {
  loadSeason,
  getDungeonIlvl,
  getMythicPlusIlvl,
  getMythicPlusVaultIlvl,
  getDelveIlvl,
  type SeasonData,
} from "./lib/season.ts";
import {
  getCurrentSeasonDungeons,
  getCurrentSeasonRaids,
  getDungeonLoot,
  filterLootForClass,
  normalizeSlotInput,
  type LootItem,
} from "./lib/dungeon-loot.ts";
import { getRaidLoot, type RaidLootItem } from "./lib/raid-journal.ts";

/** Estimate the last Tuesday 15:00 UTC reset (US servers). */
function getWeeklyResetStart(): number {
  const d = new Date();
  d.setUTCHours(15, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = (day + 7 - 2) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 7);
  return d.getTime();
}

/** Parse raid lockouts from character encounter data — returns set of "bossName|difficulty" killed this week. */
function parseRaidLockouts(raidsData: any, resetStart: number): Set<string> {
  const locked = new Set<string>();
  for (const exp of raidsData?.expansions ?? []) {
    for (const inst of exp.instances ?? []) {
      for (const mode of inst.modes ?? []) {
        const diff = mode.difficulty?.name ?? "";
        for (const enc of mode.progress?.encounters ?? []) {
          const lastKill = enc.last_kill_timestamp ?? 0;
          if (lastKill >= resetStart) {
            locked.add(`${enc.encounter?.name}|${diff}`);
          }
        }
      }
    }
  }
  return locked;
}

const pretty = hasFlag("--pretty");

// --- Content source types ---

interface ContentSource {
  type: "dungeon" | "raid";
  name: string;
  difficulty: string;
  ilvl: number;
  vault_ilvl?: number;
  track?: string;
  crest?: string;
}

interface UpgradeItem {
  item: string;
  item_id: number;
  slot: string;
  source: string;       // e.g. "Ara-Kara, City of Echoes"
  boss: string;
  difficulty: string;    // e.g. "M+3", "Heroic", "LFR"
  drop_ilvl: number;
  vault_ilvl: number | null;
  ilvl_gain: number;
  track: string | null;
  locked?: boolean;      // boss already killed this reset (raid only)
}

// Maps internal difficulty keys → API difficulty names for lockout matching
const LOCKOUT_DIFF_NAMES: Record<string, string> = {
  lfr: "Raid Finder",
  normal: "Normal",
  heroic: "Heroic",
  mythic: "Mythic",
};

try {
  const char = await resolveCharacter();
  const api = new WoWAPI(char.region);
  const season = await loadSeason();

  // Fetch character data in parallel
  const [profile, equipment, raidsEncounters] = await Promise.all([
    api.getCharacterProfile(char.realm, char.name),
    api.getCharacterEquipment(char.realm, char.name),
    api.getCharacterRaids(char.realm, char.name).catch(() => null),
  ]);

  // Parse raid lockouts for this week
  const resetStart = getWeeklyResetStart();
  const raidLockouts = raidsEncounters ? parseRaidLockouts(raidsEncounters, resetStart) : new Set<string>();

  const className = profile.character_class?.name ?? char.class ?? "Unknown";
  const armorType = getArmorType(className);
  const specArg = getArg("--spec");
  const specName = specArg ? normalizeSpec(specArg) : (profile.active_spec?.name ?? char.spec);
  const equippedIlvl = profile.equipped_item_level ?? 0;

  const SKIP_SLOTS = new Set(["Shirt", "Tabard"]);

  // Build current gear
  const gear: { slot: string; name: string; ilvl: number; quality: string }[] = (equipment.equipped_items ?? [])
    .filter((item: any) => !SKIP_SLOTS.has(item.slot?.name))
    .map((item: any) => ({
      slot: item.slot?.name,
      name: item.name,
      ilvl: item.level?.value ?? 0,
      quality: item.quality?.name,
    }));

  const gearIlvls = gear.filter((g) => g.ilvl > 0).map((g) => g.ilvl);
  const avgIlvl = gearIlvls.length > 0
    ? Math.round(gearIlvls.reduce((a, b) => a + b, 0) / gearIlvls.length)
    : 0;

  // Feasibility threshold: content is doable if drops are within this of avg ilvl
  const threshold = parseInt(getArg("--threshold") ?? "20", 10);
  const maxDropIlvl = avgIlvl + threshold;

  // Determine target slots
  const allSlots = hasFlag("--all-slots");
  const slotsArg = getArg("--slots");
  let targetSlots: Set<string> | undefined;

  if (allSlots) {
    targetSlots = undefined;
  } else if (slotsArg) {
    targetSlots = new Set(slotsArg.split(",").map(normalizeSlotInput));
  } else {
    targetSlots = new Set(
      gear
        .filter((g) => g.ilvl > 0 && g.ilvl < avgIlvl)
        .map((g) => normalizeSlotInput(g.slot)),
    );
  }

  if (targetSlots && targetSlots.size === 0) {
    output({
      character: {
        name: profile.name, realm: profile.realm?.name,
        class: className, spec: specName, armor_type: armorType,
        average_ilvl: avgIlvl, equipped_ilvl: equippedIlvl,
      },
      threshold, max_feasible_drop_ilvl: maxDropIlvl,
      message: "No weak slots found — all gear is at or above average ilvl. Use --all-slots to see all upgrade options.",
      gear: gear.sort((a, b) => a.ilvl - b.ilvl),
    }, pretty);
    process.exit(0);
  }

  // Build ilvl-by-slot map (lowest for dual slots)
  const ilvlBySlot = new Map<string, number>();
  for (const g of gear) {
    const normalized = normalizeSlotInput(g.slot);
    const existing = ilvlBySlot.get(normalized);
    if (!existing || g.ilvl < existing) {
      ilvlBySlot.set(normalized, g.ilvl);
    }
  }

  // --- Determine feasible content sources ---
  const feasibleSources: ContentSource[] = [];

  // Dungeon difficulties
  const heroicInfo = getDungeonIlvl(season, "heroic");
  if (heroicInfo && heroicInfo.ilvl <= maxDropIlvl) {
    feasibleSources.push({
      type: "dungeon", name: "Heroic Dungeons", difficulty: "heroic",
      ilvl: heroicInfo.ilvl, track: heroicInfo.track,
    });
  }

  const mythicInfo = getDungeonIlvl(season, "mythic");
  if (mythicInfo && mythicInfo.ilvl <= maxDropIlvl) {
    const vaultInfo = getMythicPlusVaultIlvl(season, 0);
    feasibleSources.push({
      type: "dungeon", name: "Mythic Dungeons (M0)", difficulty: "mythic",
      ilvl: mythicInfo.ilvl, vault_ilvl: vaultInfo?.ilvl, track: mythicInfo.track,
    });
  }

  // M+ key levels (2 through 10)
  for (let kl = 2; kl <= 10; kl++) {
    const mpInfo = getMythicPlusIlvl(season, kl);
    if (!mpInfo) continue;
    if (mpInfo.end_of_dungeon.ilvl > maxDropIlvl) break;
    feasibleSources.push({
      type: "dungeon", name: `M+${kl}`, difficulty: `m+${kl}`,
      ilvl: mpInfo.end_of_dungeon.ilvl, vault_ilvl: mpInfo.vault.ilvl,
      track: mpInfo.end_of_dungeon.track, crest: mpInfo.crest,
    });
  }

  // Raid difficulties
  const RAID_DIFFS = ["lfr", "normal", "heroic", "mythic"] as const;
  const RAID_DIFF_LABELS: Record<string, string> = { lfr: "LFR", normal: "Normal", heroic: "Heroic", mythic: "Mythic" };
  for (const diff of RAID_DIFFS) {
    const trackName = season.raid_difficulty_track[diff];
    if (!trackName) continue;
    const track = season.tracks[trackName];
    if (!track) continue;
    // Use the lowest boss rank ilvl (boss 1) to check feasibility
    if (track.min_ilvl > maxDropIlvl) break;
    feasibleSources.push({
      type: "raid", name: `Raid (${RAID_DIFF_LABELS[diff]})`, difficulty: diff,
      ilvl: track.min_ilvl, track: trackName,
    });
  }

  // Delve tiers (no specific loot to fetch — just ilvl info for the agent)
  const feasibleDelves: { tier: number; end_of_run_ilvl: number; vault_ilvl: number; track: string }[] = [];
  for (let tier = 1; tier <= 11; tier++) {
    const delveInfo = getDelveIlvl(season, tier);
    if (!delveInfo) continue;
    if (delveInfo.end_of_run.ilvl > maxDropIlvl) break;
    feasibleDelves.push({
      tier,
      end_of_run_ilvl: delveInfo.end_of_run.ilvl,
      vault_ilvl: delveInfo.vault.ilvl,
      track: delveInfo.end_of_run.track,
    });
  }

  // --- Fetch loot from all sources ---
  const allUpgrades: UpgradeItem[] = [];
  const minIlvl = parseInt(getArg("--min-ilvl") ?? "0", 10);

  // Determine which dungeon difficulties are feasible
  const feasibleDungeonDiffs = feasibleSources.filter((s) => s.type === "dungeon");
  const feasibleRaidDiffs = feasibleSources.filter((s) => s.type === "raid");

  if (feasibleDungeonDiffs.length > 0) {
    // Fetch dungeon loot once (items are the same across difficulties, only ilvl changes)
    const dungeons = await getCurrentSeasonDungeons(api);
    const allDungeonLoot: LootItem[] = [];
    for (const dungeon of dungeons) {
      const bossLoot = await getDungeonLoot(api, dungeon.id);
      const items = await filterLootForClass(api, bossLoot, dungeon.name, armorType, targetSlots, className, specName);
      allDungeonLoot.push(...items);
    }

    // Deduplicate items (same item from same boss)
    const seenItems = new Map<string, LootItem>();
    for (const item of allDungeonLoot) {
      const key = `${item.id}-${item.boss}`;
      if (!seenItems.has(key)) seenItems.set(key, item);
    }
    const uniqueLoot = [...seenItems.values()];

    // For each feasible dungeon difficulty, create upgrade entries
    for (const source of feasibleDungeonDiffs) {
      let dropIlvl: number;
      let vaultIlvl: number | null = source.vault_ilvl ?? null;

      if (source.difficulty === "heroic" || source.difficulty === "mythic") {
        const info = getDungeonIlvl(season, source.difficulty);
        if (!info) continue;
        dropIlvl = info.ilvl;
      } else {
        // M+ key level
        const keyLevel = parseInt(source.difficulty.replace("m+", ""), 10);
        const mpInfo = getMythicPlusIlvl(season, keyLevel);
        if (!mpInfo) continue;
        dropIlvl = mpInfo.end_of_dungeon.ilvl;
        vaultIlvl = mpInfo.vault.ilvl;
      }

      for (const item of uniqueLoot) {
        const slot = normalizeSlotInput(item.slot);
        const currentIlvl = ilvlBySlot.get(slot) ?? 0;
        const gain = dropIlvl - currentIlvl;
        if (gain <= 0) continue;
        if (minIlvl > 0 && dropIlvl < minIlvl) continue;

        allUpgrades.push({
          item: item.name,
          item_id: item.id,
          slot,
          source: item.dungeon,
          boss: item.boss,
          difficulty: source.difficulty === "heroic" ? "Heroic" : source.difficulty === "mythic" ? "M0" : source.name,
          drop_ilvl: dropIlvl,
          vault_ilvl: vaultIlvl,
          ilvl_gain: gain,
          track: source.track ?? null,
        });
      }
    }
  }

  // Fetch raid loot for each feasible difficulty
  if (feasibleRaidDiffs.length > 0) {
    const raids = await getCurrentSeasonRaids(api);

    for (const raid of raids) {
      for (const source of feasibleRaidDiffs) {
        const bossLoot = await getRaidLoot(api, raid.id, {
          className,
          specName,
          difficulty: source.difficulty,
        });

        for (const boss of bossLoot) {
          // Check if this boss is locked out for this difficulty
          const lockoutDiffName = LOCKOUT_DIFF_NAMES[source.difficulty] ?? source.difficulty;
          const isLocked = raidLockouts.has(`${boss.boss}|${lockoutDiffName}`);

          for (const item of boss.items) {
            const slot = normalizeSlotInput(item.slot);
            if (targetSlots && !targetSlots.has(slot)) continue;

            const dropIlvl = item.difficulty_ilvl ?? item.ilvl;
            const currentIlvl = ilvlBySlot.get(slot) ?? 0;
            const gain = dropIlvl - currentIlvl;
            if (gain <= 0) continue;
            if (dropIlvl > maxDropIlvl) continue;
            if (minIlvl > 0 && dropIlvl < minIlvl) continue;

            allUpgrades.push({
              item: item.name,
              item_id: item.id,
              slot,
              source: raid.name,
              boss: boss.boss,
              difficulty: RAID_DIFF_LABELS[source.difficulty] ?? source.difficulty,
              drop_ilvl: dropIlvl,
              vault_ilvl: null,
              ilvl_gain: gain,
              track: item.track ?? source.track ?? null,
              ...(isLocked ? { locked: true } : {}),
            });
          }
        }
      }
    }
  }

  // --- Organize results ---

  // Group by slot, deduplicate (same item+difficulty), sort by ilvl_gain desc
  const bySlot = new Map<string, UpgradeItem[]>();
  for (const upgrade of allUpgrades) {
    if (!bySlot.has(upgrade.slot)) bySlot.set(upgrade.slot, []);
    bySlot.get(upgrade.slot)!.push(upgrade);
  }

  for (const [slot, items] of bySlot) {
    const seen = new Set<string>();
    const deduped = items.filter((i) => {
      const key = `${i.item_id}-${i.difficulty}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    deduped.sort((a, b) => b.ilvl_gain - a.ilvl_gain);
    bySlot.set(slot, deduped);
  }

  // Weak gear summary
  const weakGear = gear
    .filter((g) => !targetSlots || targetSlots.has(normalizeSlotInput(g.slot)))
    .sort((a, b) => a.ilvl - b.ilvl);

  // Priority list
  const priority = [...bySlot.entries()]
    .map(([slot, items]) => {
      const maxGain = Math.max(...items.map((i) => i.ilvl_gain));
      const currentIlvl = ilvlBySlot.get(slot) ?? 0;
      return { slot, current_ilvl: currentIlvl, max_ilvl_gain: maxGain, upgrade_count: items.length };
    })
    .filter((p) => p.max_ilvl_gain > 0)
    .sort((a, b) => b.max_ilvl_gain - a.max_ilvl_gain);

  const upgradesBySlot: Record<string, UpgradeItem[]> = {};
  for (const [slot, items] of bySlot) {
    upgradesBySlot[slot] = items;
  }

  // Build raid lockout summary
  const lockoutSummary = raidLockouts.size > 0
    ? [...raidLockouts].map((key) => {
        const [boss, diff] = key.split("|");
        return { boss, difficulty: diff };
      })
    : undefined;

  output({
    character: {
      name: profile.name, realm: profile.realm?.name,
      class: className, spec: specName, armor_type: armorType,
      average_ilvl: avgIlvl, equipped_ilvl: equippedIlvl,
    },
    feasibility: {
      threshold,
      max_feasible_drop_ilvl: maxDropIlvl,
      sources: feasibleSources.map((s) => ({
        name: s.name, ilvl: s.ilvl,
        ...(s.vault_ilvl ? { vault_ilvl: s.vault_ilvl } : {}),
        ...(s.track ? { track: s.track } : {}),
        ...(s.crest ? { crest: s.crest } : {}),
      })),
      delves: feasibleDelves.length > 0 ? feasibleDelves : undefined,
    },
    ...(lockoutSummary ? { raid_lockouts: lockoutSummary } : {}),
    weak_gear: weakGear,
    priority,
    upgrades: upgradesBySlot,
  }, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
