/**
 * Shared logic for resolving recipe reagent items and quantities.
 * Combines Blizzard API data with wago.tools DB2 CSV exports.
 */

import type { WoWAPI } from "../api.ts";
import { getCachedCsv, parseCsv, indexBy, indexByMulti, type Row } from "./wago.ts";

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
