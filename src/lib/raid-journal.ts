import type { WoWAPI } from "../api.ts";
import { getArmorType, isUniversalSlot, isItemForClass } from "./class-meta.ts";
import { resolveItemDifficultyIlvls, type DifficultyIlvl } from "./item-difficulty.ts";
import { loadSeason } from "./season.ts";

export interface RaidInfo {
  id: number;
  name: string;
  expansion: string;
}

export interface EncounterSummary {
  id: number;
  name: string;
}

export interface MechanicSection {
  title: string;
  body: string;
  sections?: MechanicSection[];
}

export interface EncounterDetail {
  id: number;
  name: string;
  description: string;
  instance: string;
  mechanics: MechanicSection[];
  items: { id: number; name: string }[];
}

export interface RaidDetail {
  id: number;
  name: string;
  expansion: string;
  description: string;
  encounters: EncounterSummary[];
  media?: string;
}

export interface RaidLootItem {
  id: number;
  name: string;
  quality: string;
  ilvl: number;
  difficulty_ilvl?: number;
  track?: string;
  rank?: number;
  upgrade_range?: { min: number; max: number; ranks: number };
  slot: string;
  armor_type: string;
  stats: { name: string; value: number }[];
  effects: string[];
  binding: string;
  description: string;
  boss: string;
}

/** Extract enriched fields from a fetched item (uses preview_item when available) */
function extractLootItem(raw: { id: number; name: string }, item: any, boss: string): Omit<RaidLootItem, "slot" | "armor_type"> {
  const preview = item.preview_item ?? {};
  return {
    id: raw.id,
    name: item.name ?? raw.name,
    quality: preview.quality?.name ?? item.quality?.name ?? "Unknown",
    ilvl: preview.level?.value ?? item.level ?? 0,
    stats: (preview.stats ?? []).map((s: any) => ({
      name: s.type?.name ?? "Unknown",
      value: s.value ?? 0,
    })),
    effects: (preview.spells ?? []).map((s: any) => s.description).filter(Boolean),
    binding: preview.binding?.name ?? "",
    description: preview.description ?? item.description ?? "",
    boss,
  };
}

/** List all raid instances from the journal index */
export async function listRaids(api: WoWAPI): Promise<RaidInfo[]> {
  const index = await api.getJournalInstanceIndex();
  const raids: RaidInfo[] = [];
  for (const inst of index.instances ?? []) {
    const detail = await api.getJournalInstance(inst.id);
    if (detail.category?.type === "RAID") {
      raids.push({
        id: inst.id,
        name: inst.name,
        expansion: detail.expansion?.name ?? "Unknown",
      });
    }
  }
  return raids;
}

/** List raids for a specific expansion */
export async function listExpansionRaids(api: WoWAPI, expansionId: number): Promise<RaidInfo[]> {
  const expansion = await api.getJournalExpansion(expansionId);
  const raids: RaidInfo[] = [];
  for (const raid of expansion.raids ?? []) {
    raids.push({
      id: raid.id,
      name: raid.name,
      expansion: expansion.name,
    });
  }
  return raids;
}

/** Search for a raid by name (case-insensitive partial match) */
export async function searchRaid(api: WoWAPI, query: string): Promise<RaidInfo[]> {
  const index = await api.getJournalInstanceIndex();
  const lower = query.toLowerCase();
  const matches: RaidInfo[] = [];
  for (const inst of index.instances ?? []) {
    if (inst.name.toLowerCase().includes(lower)) {
      const detail = await api.getJournalInstance(inst.id);
      if (detail.category?.type === "RAID") {
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

/** Get full raid details including encounter list */
export async function getRaidDetail(api: WoWAPI, instanceId: number): Promise<RaidDetail> {
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

export function parseSections(sections: any[]): MechanicSection[] {
  return (sections ?? []).map((s: any) => ({
    title: s.title ?? "",
    body: s.body_text ?? "",
    ...(s.sections?.length ? { sections: parseSections(s.sections) } : {}),
  }));
}

/** Get detailed encounter info including mechanics */
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

export interface RaidLootOptions {
  className?: string;
  specName?: string;
  difficulty?: string;
  noCache?: boolean;
  seasonSlug?: string;
}

/** Get loot for a raid instance, optionally filtered by class and with difficulty ilvl */
export async function getRaidLoot(
  api: WoWAPI,
  instanceId: number,
  options: RaidLootOptions = {},
): Promise<{ boss: string; items: RaidLootItem[] }[]> {
  const { className, specName, difficulty, noCache = false, seasonSlug } = options;
  const raid = await getRaidDetail(api, instanceId);
  const results: { boss: string; items: RaidLootItem[] }[] = [];

  // Load tier token prefixes from seasonal data for class filtering
  let tierTokenPrefixes: Record<string, string> | undefined;
  if (className) {
    try {
      const season = await loadSeason(seasonSlug);
      tierTokenPrefixes = season.tier_token_prefixes;
    } catch { /* no seasonal data — skip tier token filtering */ }
  }

  for (const enc of raid.encounters) {
    const encounter = await api.getJournalEncounter(enc.id);
    const rawItems: { id: number; name: string }[] = (encounter.items ?? [])
      .filter((item: any) => item?.item?.id)
      .map((item: any) => ({ id: item.item.id, name: item.item.name ?? "Unknown" }));

    const lootItems: RaidLootItem[] = [];
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

        lootItems.push({
          ...extractLootItem(d.raw, d.item, enc.name),
          slot,
          armor_type: subclass ?? "Universal",
        });
      }
    }

    results.push({ boss: enc.name, items: lootItems });
  }

  // Resolve difficulty ilvls if requested
  if (difficulty) {
    // Build boss position map: item ID → encounter position (1-indexed)
    const bossPositions = new Map<number, number>();
    for (let i = 0; i < results.length; i++) {
      for (const item of results[i].items) {
        bossPositions.set(item.id, i + 1);
      }
    }

    const allItemIds = results.flatMap((b) => b.items.map((i) => i.id));
    const ilvlMap = await resolveItemDifficultyIlvls(allItemIds, difficulty, bossPositions, seasonSlug);
    for (const boss of results) {
      for (const item of boss.items) {
        const resolved = ilvlMap.get(item.id);
        if (resolved) {
          item.difficulty_ilvl = resolved.ilvl;
          item.track = resolved.track;
          item.rank = resolved.rank;
          item.upgrade_range = resolved.upgrade_range;
        }
      }
    }
  }

  return results;
}
