/**
 * Shared logic for resolving recipe reagent items and quantities.
 * Combines Blizzard API data with wago.tools DB2 CSV exports.
 */

import { mkdir, stat } from "node:fs/promises";
import type { WoWAPI } from "../api.ts";

const CACHE_DIR = "data/cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WAGO_BASE = "https://wago.tools/db2";

type Row = Record<string, string>;

export interface OldReagent {
  item_id: number;
  name: string;
  quantity: number;
}

export interface ModernReagentItem {
  item_id: number;
  name: string;
  quality_tier: number;
}

export interface ReagentSlot {
  slot: number;
  name: string;
  quantity: number;
  items: ModernReagentItem[];
}

export type ResolvedRecipe =
  | { type: "old"; recipe_id: number; recipe_name: string; spell_id: number; reagents: OldReagent[] }
  | { type: "modern"; recipe_id: number; recipe_name: string; spell_id: number; reagent_slots: ReagentSlot[] }
  | { type: "hybrid"; recipe_id: number; recipe_name: string; spell_id: number; reagents: OldReagent[]; reagent_slots: ReagentSlot[] };

export async function getCachedCsv(name: string, noCache: boolean): Promise<string> {
  const path = `${CACHE_DIR}/${name}.csv`;
  if (!noCache) {
    try {
      const s = await stat(path);
      if (Date.now() - s.mtimeMs < CACHE_TTL_MS) {
        return await Bun.file(path).text();
      }
    } catch {}
  }
  const res = await fetch(`${WAGO_BASE}/${name}/csv`);
  if (!res.ok) throw new Error(`Failed to fetch ${name} CSV: ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await Bun.write(path, text);
  return text;
}

function parseCsv(content: string): Row[] {
  const lines = content.split("\n");
  const headers = lines[0].split(",");
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(",");
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }
  return rows;
}

function indexBy(rows: Row[], key: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) map.set(row[key], row);
  return map;
}

function indexByMulti(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = row[key];
    const arr = map.get(k);
    if (arr) arr.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export async function resolveRecipeReagents(api: WoWAPI, recipeId: number, noCache: boolean): Promise<ResolvedRecipe> {
  const [recipe, slaText, srText, mcssText, crqText] = await Promise.all([
    api.getRecipe(recipeId),
    getCachedCsv("SkillLineAbility", noCache),
    getCachedCsv("SpellReagents", noCache),
    getCachedCsv("ModifiedCraftingSpellSlot", noCache),
    getCachedCsv("CraftingReagentQuality", noCache),
  ]);

  const skillLines = indexBy(parseCsv(slaText), "ID");
  const skillRow = skillLines.get(String(recipeId));
  const spellId = skillRow?.Spell ?? String(recipeId);

  const numericSpellId = parseInt(spellId, 10);
  const base = { recipe_id: recipeId, recipe_name: recipe.name, spell_id: numericSpellId };

  // Resolve classic SpellReagents
  let oldReagents: OldReagent[] | null = null;
  const spellReagents = indexBy(parseCsv(srText), "SpellID");
  const srRow = spellReagents.get(spellId);

  if (srRow) {
    const rawReagents: { itemId: number; quantity: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const itemId = parseInt(srRow[`Reagent_${i}`] ?? "0", 10);
      const quantity = parseInt(srRow[`ReagentCount_${i}`] ?? "0", 10);
      if (itemId > 0 && quantity > 0) rawReagents.push({ itemId, quantity });
    }

    if (rawReagents.length > 0) {
      oldReagents = await Promise.all(
        rawReagents.map(async ({ itemId, quantity }) => {
          try {
            const item = await api.getItem(itemId);
            return { item_id: itemId, name: item.name as string, quantity };
          } catch {
            return { item_id: itemId, name: "Unknown", quantity };
          }
        }),
      );
    }
  }

  // Resolve modified crafting slots (Dragonflight+)
  let modernSlots: ReagentSlot[] | null = null;
  const mcssRows = indexByMulti(parseCsv(mcssText), "SpellID");
  const crqRows = indexByMulti(parseCsv(crqText), "ModifiedCraftingCategoryID");

  const slots = mcssRows.get(spellId);
  if (slots && slots.length > 0) {
    slots.sort((a, b) => parseInt(a.Slot) - parseInt(b.Slot));

    modernSlots = await Promise.all(
      slots.map(async (slot) => {
        const slotTypeId = parseInt(slot.ModifiedCraftingReagentSlotID, 10);
        const quantity = parseInt(slot.ReagentCount, 10);

        let slotType: any;
        try {
          slotType = await api.getModifiedCraftingReagentSlotType(slotTypeId);
        } catch {
          return { slot: parseInt(slot.Slot), name: "Unknown", quantity, items: [] } as ReagentSlot;
        }

        const slotName: string = slotType.description ?? `Slot Type ${slotTypeId}`;
        const categories: { id: number; name: string }[] = slotType.compatible_categories ?? [];

        const items: ModernReagentItem[] = [];
        for (const cat of categories) {
          const qualityRows = crqRows.get(String(cat.id)) ?? [];
          const resolved = await Promise.all(
            qualityRows
              .filter((r) => parseInt(r.ItemID, 10) > 0)
              .map(async (r) => {
                const itemId = parseInt(r.ItemID, 10);
                const tier = parseInt(r.OrderIndex, 10);
                try {
                  const item = await api.getItem(itemId);
                  return { item_id: itemId, name: item.name as string, quality_tier: tier + 1 };
                } catch {
                  return { item_id: itemId, name: "Unknown", quality_tier: tier + 1 };
                }
              }),
          );
          items.push(...resolved);
        }

        items.sort((a, b) => a.quality_tier - b.quality_tier);
        return { slot: parseInt(slot.Slot), name: slotName, quantity, items } as ReagentSlot;
      }),
    );
  }

  if (oldReagents && modernSlots) {
    return { type: "hybrid", ...base, reagents: oldReagents, reagent_slots: modernSlots };
  }
  if (oldReagents) {
    return { type: "old", ...base, reagents: oldReagents };
  }
  if (modernSlots) {
    return { type: "modern", ...base, reagent_slots: modernSlots };
  }
  throw new Error(`No reagent data found for recipe ${recipeId} (${recipe.name ?? "unknown"}).`);
}
