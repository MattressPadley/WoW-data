#!/usr/bin/env bun
/**
 * crafting.ts — Query modified crafting system data
 *
 * Usage:
 *   ./run src/crafting.ts [--pretty]                           # crafting index
 *   ./run src/crafting.ts --categories [--pretty]              # list categories
 *   ./run src/crafting.ts --category-id 1 [--pretty]           # get category
 *   ./run src/crafting.ts --slot-types [--pretty]              # list slot types
 *   ./run src/crafting.ts --slot-type-id 1 [--pretty]          # get slot type
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const categoryId = getArg("--category-id");
  const slotTypeId = getArg("--slot-type-id");

  if (categoryId) {
    data = await api.getModifiedCraftingCategory(parseInt(categoryId, 10));
  } else if (hasFlag("--categories")) {
    data = await api.getModifiedCraftingCategoryIndex();
  } else if (slotTypeId) {
    data = await api.getModifiedCraftingReagentSlotType(parseInt(slotTypeId, 10));
  } else if (hasFlag("--slot-types")) {
    data = await api.getModifiedCraftingReagentSlotTypeIndex();
  } else {
    data = await api.getModifiedCraftingIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
