import type { WoWAPI } from "../api.ts";
import { isUniversalSlot, isItemForClass } from "./class-meta.ts";

export interface LootItem {
  id: number;
  name: string;
  slot: string;
  armor_type: string;
  dungeon: string;
  boss: string;
}

export interface DungeonInfo {
  id: number;
  name: string;
}

interface RawBossLoot {
  boss: string;
  items: { id: number; name: string }[];
}

// Shared item cache to avoid re-fetching the same item across dungeons
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

async function getCurrentSeasonExpansion(api: WoWAPI) {
  const index = await api.getJournalExpansionIndex();
  const currentSeason = index.tiers?.find((t: any) => /current season/i.test(t.name));
  if (!currentSeason) throw new Error("Could not find Current Season in journal expansions");
  return api.getJournalExpansion(currentSeason.id);
}

export async function getCurrentSeasonDungeons(api: WoWAPI): Promise<DungeonInfo[]> {
  const expansion = await getCurrentSeasonExpansion(api);
  return (expansion.dungeons ?? [])
    .filter((d: any) => !/keystone dungeons/i.test(d.name))
    .map((d: any) => ({ id: d.id, name: d.name }));
}

export async function getCurrentSeasonRaids(api: WoWAPI): Promise<DungeonInfo[]> {
  const expansion = await getCurrentSeasonExpansion(api);
  return (expansion.raids ?? [])
    .map((r: any) => ({ id: r.id, name: r.name }));
}

export async function getDungeonLoot(api: WoWAPI, instanceId: number): Promise<RawBossLoot[]> {
  const instance = await api.getJournalInstance(instanceId);
  const encounters: { id: number; name: string }[] = (instance.encounters ?? []).map((e: any) => ({
    id: e.id,
    name: e.name,
  }));

  // Fetch encounters sequentially to avoid rate limits
  const results: RawBossLoot[] = [];
  for (const enc of encounters) {
    const encounter = await api.getJournalEncounter(enc.id);
    const items: { id: number; name: string }[] = (encounter.items ?? [])
      .filter((item: any) => item?.item?.id)
      .map((item: any) => ({ id: item.item.id, name: item.item.name ?? "Unknown" }));
    results.push({ boss: enc.name, items });
  }

  return results;
}

export async function filterLootForClass(
  api: WoWAPI,
  bossLoot: RawBossLoot[],
  dungeonName: string,
  armorType: string,
  slots?: Set<string>,
  className?: string,
  specName?: string,
): Promise<LootItem[]> {
  // Collect all unique item IDs to fetch
  const itemMap = new Map<number, { bosses: string[]; name: string }>();
  for (const boss of bossLoot) {
    for (const item of boss.items) {
      const existing = itemMap.get(item.id);
      if (existing) {
        if (!existing.bosses.includes(boss.boss)) {
          existing.bosses.push(boss.boss);
        }
      } else {
        itemMap.set(item.id, { bosses: [boss.boss], name: item.name });
      }
    }
  }

  // Fetch item details in small batches
  const entries = [...itemMap.entries()];
  const BATCH_SIZE = 10;
  const results: LootItem[] = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(
      batch.map(async ([id, info]) => {
        const item = await getItemCached(api, id);
        return item ? { id, info, item } : null;
      }),
    );

    for (const detail of details) {
      if (!detail) continue;
      const { id, info, item } = detail;

      const slot = item.inventory_type?.name;
      if (!slot) continue;

      const subclass = item.item_subclass?.name;
      const itemClassName = item.item_class?.name;

      // Use comprehensive class filter when className is provided
      if (className) {
        const itemStats = (item.preview_item?.stats ?? []).map((s: any) => s.type?.name).filter(Boolean);
        const keep = isItemForClass(className, {
          itemClass: itemClassName ?? "",
          itemSubclass: subclass ?? "",
          slot,
          stats: itemStats,
          name: item.name ?? info.name,
        }, undefined, specName);
        if (!keep) continue;
      } else {
        const isArmor = itemClassName === "Armor";
        const keep = isUniversalSlot(slot) || (isArmor && subclass === armorType);
        if (!keep) continue;
      }

      // Slot filter if specified
      if (slots && !slots.has(normalizeSlot(slot))) continue;

      for (const boss of info.bosses) {
        results.push({
          id,
          name: item.name ?? info.name,
          slot,
          armor_type: subclass ?? "Universal",
          dungeon: dungeonName,
          boss,
        });
      }
    }
  }

  return results;
}

function normalizeSlot(slot: string): string {
  return slot
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("finger", "ring");
}

export function normalizeSlotInput(input: string): string {
  const map: Record<string, string> = {
    head: "head",
    neck: "neck",
    shoulders: "shoulders", shoulder: "shoulders",
    chest: "chest",
    waist: "waist", belt: "waist",
    legs: "legs",
    feet: "feet", boots: "feet",
    wrist: "wrist", wrists: "wrist", bracer: "wrist", bracers: "wrist",
    hands: "hands", gloves: "hands",
    ring: "ring", rings: "ring", finger: "ring",
    trinket: "trinket", trinkets: "trinket",
    back: "back", cloak: "back", cape: "back",
    mainhand: "mainhand", weapon: "mainhand",
    offhand: "offhand", shield: "offhand",
  };
  return map[input.toLowerCase()] ?? input.toLowerCase();
}
