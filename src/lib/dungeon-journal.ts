import type { WoWAPI } from "../api.ts";
import { isItemForClass } from "./class-meta.ts";
import { parseSections, type MechanicSection } from "./raid-journal.ts";
import type { DungeonInfo } from "./dungeon-loot.ts";
import { resolveDungeonItemIlvls, type DungeonDifficultyIlvl } from "./item-difficulty.ts";
import { loadSeason } from "./season.ts";

export interface DungeonInfoExpanded {
  id: number;
  name: string;
  expansion: string;
}

export interface EncounterSummary {
  id: number;
  name: string;
}

export interface DungeonDetail {
  id: number;
  name: string;
  expansion: string;
  description: string;
  encounters: EncounterSummary[];
  media?: string;
}

export interface EncounterDetail {
  id: number;
  name: string;
  description: string;
  instance: string;
  mechanics: MechanicSection[];
  items: { id: number; name: string }[];
}

export interface DungeonLootItem {
  id: number;
  name: string;
  quality: string;
  ilvl: number;
  difficulty_ilvl?: number;
  end_of_dungeon_ilvl?: number;
  vault_ilvl?: number;
  track?: string;
  rank?: number;
  upgrade_range?: { min: number; max: number; ranks: number };
  vault_track?: string;
  vault_rank?: number;
  vault_upgrade_range?: { min: number; max: number; ranks: number };
  crest?: string;
  slot: string;
  armor_type: string;
  stats: { name: string; value: number }[];
  effects: string[];
  binding: string;
  description: string;
  boss: string;
}

// Item cache shared across calls
const itemCache = new Map<number, any>();

async function getItemCached(api: WoWAPI, id: number): Promise<any | null> {
  if (itemCache.has(id)) return itemCache.get(id);
  try {
    const item = await api.getItem(id);
    itemCache.set(id, item);
    return item;
  } catch {
    itemCache.set(id, null);
    return null;
  }
}

/** List all dungeon instances from the journal index. */
export async function listDungeons(api: WoWAPI): Promise<DungeonInfoExpanded[]> {
  const index = await api.getJournalInstanceIndex();
  const dungeons: DungeonInfoExpanded[] = [];
  for (const inst of index.instances ?? []) {
    const detail = await api.getJournalInstance(inst.id);
    if (detail.category?.type === "DUNGEON") {
      dungeons.push({
        id: inst.id,
        name: inst.name,
        expansion: detail.expansion?.name ?? "Unknown",
      });
    }
  }
  return dungeons;
}

/** List dungeons for a specific expansion. */
export async function listExpansionDungeons(api: WoWAPI, expansionId: number): Promise<DungeonInfoExpanded[]> {
  const expansion = await api.getJournalExpansion(expansionId);
  return (expansion.dungeons ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    expansion: expansion.name,
  }));
}

/** List current M+ keystone rotation dungeons from season data. */
export async function listSeasonDungeons(seasonSlug?: string): Promise<DungeonInfo[]> {
  const season = await loadSeason(seasonSlug);
  return (season.keystone_dungeons ?? []).map((d) => ({ id: d.id, name: d.name }));
}

/** Search for a dungeon by name (case-insensitive partial match). */
export async function searchDungeon(api: WoWAPI, query: string): Promise<DungeonInfoExpanded[]> {
  const index = await api.getJournalInstanceIndex();
  const lower = query.toLowerCase();
  const matches: DungeonInfoExpanded[] = [];
  for (const inst of index.instances ?? []) {
    if (inst.name.toLowerCase().includes(lower)) {
      const detail = await api.getJournalInstance(inst.id);
      if (detail.category?.type === "DUNGEON") {
        matches.push({
          id: inst.id,
          name: inst.name,
          expansion: detail.expansion?.name ?? "Unknown",
        });
      }
    }
  }
  return matches;
}

/** Get full dungeon details including encounter list. */
export async function getDungeonDetail(api: WoWAPI, instanceId: number): Promise<DungeonDetail> {
  const instance = await api.getJournalInstance(instanceId);
  let media: string | undefined;
  try {
    const mediaData = await api.getJournalInstanceMedia(instanceId);
    media = mediaData.assets?.[0]?.value;
  } catch { /* no media */ }

  return {
    id: instanceId,
    name: instance.name,
    expansion: instance.expansion?.name ?? "Unknown",
    description: instance.description ?? "",
    encounters: (instance.encounters ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
    })),
    media,
  };
}

/** Get detailed encounter info including mechanics. */
export async function getEncounterDetail(api: WoWAPI, encounterId: number): Promise<EncounterDetail> {
  const encounter = await api.getJournalEncounter(encounterId);
  return {
    id: encounterId,
    name: encounter.name,
    description: encounter.description ?? "",
    instance: encounter.instance?.name ?? "Unknown",
    mechanics: parseSections(encounter.sections),
    items: (encounter.items ?? [])
      .filter((item: any) => item?.item?.id)
      .map((item: any) => ({ id: item.item.id, name: item.item.name ?? "Unknown" })),
  };
}

export interface DungeonLootOptions {
  className?: string;
  specName?: string;
  difficulty?: string;
  keyLevel?: number;
  seasonSlug?: string;
}

/** Get enriched loot for a dungeon instance, optionally filtered by class/spec with difficulty ilvl. */
export async function getDungeonLootEnriched(
  api: WoWAPI,
  instanceId: number,
  options: DungeonLootOptions = {},
): Promise<{ boss: string; items: DungeonLootItem[] }[]> {
  const { className, specName, difficulty, keyLevel, seasonSlug } = options;
  const dungeon = await getDungeonDetail(api, instanceId);
  const results: { boss: string; items: DungeonLootItem[] }[] = [];

  // Load season data for tier token prefixes and legacy item filtering
  let tierTokenPrefixes: Record<string, string> | undefined;
  let minItemId = 0;
  try {
    const season = await loadSeason(seasonSlug);
    tierTokenPrefixes = className ? season.tier_token_prefixes : undefined;
    // Legacy dungeons have bloated journal loot tables; filter by min_item_id
    const keystoneEntry = season.keystone_dungeons?.find((d) => d.id === instanceId);
    if (keystoneEntry?.min_item_id) minItemId = keystoneEntry.min_item_id;
  } catch { /* no seasonal data */ }

  for (const enc of dungeon.encounters) {
    const encounter = await api.getJournalEncounter(enc.id);
    const rawItems: { id: number; name: string }[] = (encounter.items ?? [])
      .filter((item: any) => item?.item?.id && item.item.id >= minItemId)
      .map((item: any) => ({ id: item.item.id, name: item.item.name ?? "Unknown" }));

    const lootItems: DungeonLootItem[] = [];
    const BATCH = 10;
    for (let i = 0; i < rawItems.length; i += BATCH) {
      const batch = rawItems.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map(async (raw) => {
          const item = await getItemCached(api, raw.id);
          return item ? { raw, item } : null;
        }),
      );

      for (const d of details) {
        if (!d) continue;
        const slot = d.item.inventory_type?.name;
        if (!slot) continue;

        const subclass = d.item.item_subclass?.name;
        const itemClassName = d.item.item_class?.name;

        if (className) {
          const itemStats = (d.item.preview_item?.stats ?? []).map((s: any) => s.type?.name).filter(Boolean);
          const keep = isItemForClass(className, {
            itemClass: itemClassName ?? "",
            itemSubclass: subclass ?? "",
            slot,
            stats: itemStats,
            name: d.item.name ?? d.raw.name,
          }, tierTokenPrefixes, specName);
          if (!keep) continue;
        }

        const preview = d.item.preview_item ?? {};
        lootItems.push({
          id: d.raw.id,
          name: d.item.name ?? d.raw.name,
          quality: preview.quality?.name ?? d.item.quality?.name ?? "Unknown",
          ilvl: preview.level?.value ?? d.item.level ?? 0,
          slot,
          armor_type: subclass ?? "Universal",
          stats: (preview.stats ?? []).map((s: any) => ({
            name: s.type?.name ?? "Unknown",
            value: s.value ?? 0,
          })),
          effects: (preview.spells ?? []).map((s: any) => s.description).filter(Boolean),
          binding: preview.binding?.name ?? "",
          description: preview.description ?? d.item.description ?? "",
          boss: enc.name,
        });
      }
    }

    results.push({ boss: enc.name, items: lootItems });
  }

  // Resolve difficulty ilvls
  if (difficulty || keyLevel != null) {
    const allItemIds = results.flatMap((b) => b.items.map((i) => i.id));
    const ilvlMap = await resolveDungeonItemIlvls(allItemIds, { difficulty, keyLevel, seasonSlug });
    for (const boss of results) {
      for (const item of boss.items) {
        const resolved = ilvlMap.get(item.id);
        if (resolved) {
          if (keyLevel != null) {
            item.end_of_dungeon_ilvl = resolved.ilvl;
            item.vault_ilvl = resolved.vault_ilvl;
            item.vault_track = resolved.vault_track;
            item.vault_rank = resolved.vault_rank;
            item.vault_upgrade_range = resolved.vault_upgrade_range;
          } else {
            item.difficulty_ilvl = resolved.ilvl;
          }
          item.track = resolved.track;
          item.rank = resolved.rank;
          item.upgrade_range = resolved.upgrade_range;
          item.crest = resolved.crest;
        }
      }
    }
  }

  return results;
}
