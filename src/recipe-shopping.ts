#!/usr/bin/env bun
/**
 * recipe-shopping.ts — Shopping list with AH prices for a recipe
 *
 * Resolves recipe reagents and fetches auction house commodity prices
 * to produce a shopping list with per-item and total costs.
 *
 * Usage:
 *   ./run src/recipe-shopping.ts --id 53044 [--realm 11] [--pretty] [--no-cache]
 */

import { WoWAPI } from "./api.ts";
import { requireArg, getArg, hasFlag, output, parseGold } from "./utils.ts";
import { resolveRecipeReagents, type ReagentSlot } from "./lib/recipe-reagents.ts";

interface Auction {
  item_id: number;
  quantity: number;
  unit_price: number;
}

function buildPriceIndex(auctions: any[]): Map<number, Auction[]> {
  const index = new Map<number, Auction[]>();
  for (const a of auctions) {
    const itemId = a.item?.id;
    if (!itemId) continue;
    const entry: Auction = { item_id: itemId, quantity: a.quantity, unit_price: a.unit_price };
    const arr = index.get(itemId);
    if (arr) arr.push(entry);
    else index.set(itemId, [entry]);
  }
  // Sort each item's listings by unit price ascending
  for (const listings of index.values()) {
    listings.sort((a, b) => a.unit_price - b.unit_price);
  }
  return index;
}

function calculateFillCost(listings: Auction[], quantityNeeded: number) {
  if (!listings || listings.length === 0) {
    return { total_cost: 0, quantity_available: 0, fully_available: false, cheapest_unit_price: 0, avg_unit_price: 0 };
  }

  let remaining = quantityNeeded;
  let totalCost = 0;
  let totalFilled = 0;
  const cheapest = listings[0].unit_price;

  for (const listing of listings) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, listing.quantity);
    totalCost += take * listing.unit_price;
    totalFilled += take;
    remaining -= take;
  }

  return {
    total_cost: totalCost,
    quantity_available: totalFilled,
    fully_available: remaining <= 0,
    cheapest_unit_price: cheapest,
    avg_unit_price: totalFilled > 0 ? Math.round(totalCost / totalFilled) : 0,
  };
}

function priceEntry(copper: number) {
  const g = parseGold(copper);
  return { raw_copper: copper, gold: g.gold, silver: g.silver, copper: g.copper };
}

const id = parseInt(requireArg("--id", "Recipe ID"), 10);
const realmArg = getArg("--realm");
const pretty = hasFlag("--pretty");
const noCache = hasFlag("--no-cache");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  // Resolve reagents and fetch AH data in parallel
  const promises: [ReturnType<typeof resolveRecipeReagents>, Promise<any>, Promise<any> | null] = [
    resolveRecipeReagents(api, id, noCache),
    api.getAHCommodities(),
    realmArg ? api.getAHRealmAuctions(parseInt(realmArg, 10)) : Promise.resolve(null),
  ];

  const [recipe, commodityData, realmData] = await Promise.all(promises);

  // Build unified price index from commodity + realm auctions
  const priceIndex = buildPriceIndex(commodityData.auctions ?? []);
  if (realmData?.auctions) {
    for (const a of realmData.auctions) {
      const itemId = a.item?.id;
      if (!itemId) continue;
      const entry: Auction = { item_id: itemId, quantity: a.quantity ?? 1, unit_price: a.unit_price ?? a.buyout ?? 0 };
      if (!entry.unit_price) continue;
      const arr = priceIndex.get(itemId);
      if (arr) arr.push(entry);
      else priceIndex.set(itemId, [entry]);
    }
    for (const listings of priceIndex.values()) {
      listings.sort((a, b) => a.unit_price - b.unit_price);
    }
  }

  // Build shopping list

  function priceBasicReagents(reagents: { item_id: number; name: string; quantity: number }[]) {
    let total = 0;
    const list = reagents.map((r) => {
      const fill = calculateFillCost(priceIndex.get(r.item_id) ?? [], r.quantity);
      if (fill.fully_available) total += fill.total_cost;
      return {
        item_id: r.item_id,
        name: r.name,
        quantity: r.quantity,
        cheapest_unit_price: priceEntry(fill.cheapest_unit_price),
        avg_unit_price: priceEntry(fill.avg_unit_price),
        total_cost: priceEntry(fill.total_cost),
        fully_available: fill.fully_available,
        quantity_available: fill.quantity_available,
      };
    });
    return { list, total };
  }

  function priceReagentSlots(reagentSlots: ReagentSlot[]) {
    let maxTier = 0;
    for (const slot of reagentSlots) {
      for (const item of slot.items) {
        if (item.quality_tier > maxTier) maxTier = item.quality_tier;
      }
    }

    const list = reagentSlots.map((slot) => {
      const options = slot.items.map((item) => {
        const fill = calculateFillCost(priceIndex.get(item.item_id) ?? [], slot.quantity);
        return {
          item_id: item.item_id,
          name: item.name,
          quality_tier: item.quality_tier,
          unit_price: priceEntry(fill.cheapest_unit_price),
          total_cost: priceEntry(fill.total_cost),
          fully_available: fill.fully_available,
          quantity_available: fill.quantity_available,
        };
      });

      const cost_by_quality: Record<string, any> = {};
      for (let tier = 1; tier <= maxTier; tier++) {
        const tierOptions = options.filter((o) => o.quality_tier === tier && o.fully_available);
        const cheapest = tierOptions.sort((a, b) => a.total_cost.raw_copper - b.total_cost.raw_copper)[0];
        if (cheapest) {
          cost_by_quality[`tier_${tier}`] = {
            item: cheapest.name,
            unit_price: cheapest.unit_price,
            total_cost: cheapest.total_cost,
          };
        }
      }

      const cheapestOption = options
        .filter((o) => o.fully_available)
        .sort((a, b) => a.total_cost.raw_copper - b.total_cost.raw_copper)[0];

      return {
        slot_name: slot.name,
        quantity: slot.quantity,
        cost_by_quality: Object.keys(cost_by_quality).length > 0 ? cost_by_quality : undefined,
        cheapest_option: cheapestOption
          ? { name: cheapestOption.name, total_cost: cheapestOption.total_cost }
          : null,
        options,
      };
    });

    const totals_by_quality: Record<string, any> = {};
    for (let tier = 1; tier <= maxTier; tier++) {
      let total = 0;
      for (const slot of list) {
        const tierCost = slot.cost_by_quality?.[`tier_${tier}`];
        if (tierCost) {
          total += tierCost.total_cost.raw_copper;
        } else if (slot.cheapest_option) {
          total += slot.cheapest_option.total_cost.raw_copper;
        }
      }
      totals_by_quality[`tier_${tier}`] = priceEntry(total);
    }

    return { list, totals_by_quality };
  }

  if (recipe.type === "old") {
    const { list: shopping_list, total: grandTotal } = priceBasicReagents(recipe.reagents);
    output({
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.recipe_name,
      shopping_list,
      grand_total: priceEntry(grandTotal),
    }, pretty);
  } else if (recipe.type === "hybrid") {
    const { list: shopping_list, total: basicTotal } = priceBasicReagents(recipe.reagents);
    const { list: shopping_list_slots, totals_by_quality } = priceReagentSlots(recipe.reagent_slots);

    // Add basic reagent cost to each quality tier total
    for (const key of Object.keys(totals_by_quality)) {
      const tierCopper = totals_by_quality[key].raw_copper + basicTotal;
      totals_by_quality[key] = priceEntry(tierCopper);
    }

    output({
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.recipe_name,
      shopping_list,
      shopping_list_slots,
      grand_total: priceEntry(basicTotal),
      totals_by_quality,
    }, pretty);
  } else {
    const { list: shopping_list, totals_by_quality } = priceReagentSlots(recipe.reagent_slots);
    output({
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.recipe_name,
      shopping_list,
      totals_by_quality,
    }, pretty);
  }
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
