#!/usr/bin/env bun
/**
 * quest.ts — Query quest data (quests, categories, areas, types)
 *
 * Usage:
 *   ./run src/quest.ts [--pretty]                          # list quests
 *   ./run src/quest.ts --id 2 [--pretty]                   # get quest
 *   ./run src/quest.ts --categories [--pretty]             # list categories
 *   ./run src/quest.ts --category-id 1 [--pretty]          # get category
 *   ./run src/quest.ts --areas [--pretty]                  # list areas
 *   ./run src/quest.ts --area-id 1 [--pretty]              # get area
 *   ./run src/quest.ts --types [--pretty]                  # list types
 *   ./run src/quest.ts --type-id 1 [--pretty]              # get type
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const categoryId = getArg("--category-id");
  const areaId = getArg("--area-id");
  const typeId = getArg("--type-id");

  if (typeId) {
    data = await api.getQuestType(parseInt(typeId, 10));
  } else if (hasFlag("--types")) {
    data = await api.getQuestTypeIndex();
  } else if (areaId) {
    data = await api.getQuestArea(parseInt(areaId, 10));
  } else if (hasFlag("--areas")) {
    data = await api.getQuestAreaIndex();
  } else if (categoryId) {
    data = await api.getQuestCategory(parseInt(categoryId, 10));
  } else if (hasFlag("--categories")) {
    data = await api.getQuestCategoryIndex();
  } else if (id) {
    data = await api.getQuest(parseInt(id, 10));
  } else {
    data = await api.getQuestIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
