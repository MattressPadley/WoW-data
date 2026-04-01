#!/usr/bin/env bun
/**
 * dungeon-loot.ts — Current season dungeon loot filtered by class
 *
 * Usage:
 *   ./run src/dungeon-loot.ts --realm turalyon --name treepunch [--pretty]
 *   ./run src/dungeon-loot.ts --class monk [--slot head] [--pretty]
 *   ./run src/dungeon-loot.ts --class monk --spec ww [--pretty]                      # spec-filtered
 *   ./run src/dungeon-loot.ts --dungeon "Halls of Atonement" --class monk [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";
import { getArmorType, normalizeClass, normalizeSpec } from "./lib/class-meta.ts";
import {
  getCurrentSeasonDungeons,
  getDungeonLoot,
  filterLootForClass,
  normalizeSlotInput,
} from "./lib/dungeon-loot.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  // Determine class and armor type from character or --class flag
  let armorType: string;
  let className: string | undefined;
  const classArg = getArg("--class");
  const realm = getArg("--realm");
  const name = getArg("--name");

  if (realm && name) {
    const profile = await api.getCharacterProfile(realm, name);
    className = profile.character_class?.name ?? "Unknown";
    armorType = getArmorType(className);
  } else if (classArg) {
    className = normalizeClass(classArg);
    armorType = getArmorType(className);
  } else {
    console.error(JSON.stringify({ error: "Provide --realm + --name or --class" }));
    process.exit(1);
  }

  const specArg = getArg("--spec");
  const specName = specArg && className ? normalizeSpec(specArg) : undefined;

  // Optional slot filter
  const slotArg = getArg("--slot");
  const slotFilter = slotArg
    ? new Set(slotArg.split(",").map(normalizeSlotInput))
    : undefined;

  // Get dungeons
  const dungeonFilter = getArg("--dungeon");
  let dungeons = await getCurrentSeasonDungeons(api);

  if (dungeonFilter) {
    const lower = dungeonFilter.toLowerCase();
    dungeons = dungeons.filter((d) => d.name.toLowerCase().includes(lower));
    if (dungeons.length === 0) {
      console.error(JSON.stringify({ error: `No dungeons matching "${dungeonFilter}"` }));
      process.exit(1);
    }
  }

  // Fetch loot from dungeons sequentially to avoid rate limits
  const dungeonResults: { dungeon: string; items: LootItem[] }[] = [];
  for (const dungeon of dungeons) {
    const bossLoot = await getDungeonLoot(api, dungeon.id);
    const filtered = await filterLootForClass(api, bossLoot, dungeon.name, armorType, slotFilter, className, specName);
    dungeonResults.push({ dungeon: dungeon.name, items: filtered });
  }

  // Filter out dungeons with no matching loot
  const results = dungeonResults.filter((d) => d.items.length > 0);

  output({
    armor_type: armorType,
    slot_filter: slotArg ?? "all",
    dungeons: results,
    total_items: results.reduce((sum, d) => sum + d.items.length, 0),
  }, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
