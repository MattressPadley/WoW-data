#!/usr/bin/env bun
/**
 * dungeon-loot.ts — Current season dungeon loot filtered by class
 *
 * Usage (active character):
 *   ./run src/dungeon-loot.ts [--pretty]
 *   ./run src/dungeon-loot.ts --slot head [--pretty]
 *
 * Usage (class-only, no character needed):
 *   ./run src/dungeon-loot.ts --class monk [--slot head] [--pretty]
 *   ./run src/dungeon-loot.ts --class monk --spec ww [--pretty]
 *
 * Usage (explicit character):
 *   ./run src/dungeon-loot.ts --character treepunch [--pretty]
 *   ./run src/dungeon-loot.ts --realm turalyon --name treepunch [--pretty]
 *   ./run src/dungeon-loot.ts --dungeon "Halls of Atonement" [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";
import { getArmorType, normalizeClass, normalizeSpec } from "./lib/class-meta.ts";
import { resolveCharacter } from "./lib/character.ts";
import {
  getCurrentSeasonDungeons,
  getDungeonLoot,
  filterLootForClass,
  normalizeSlotInput,
  type LootItem,
} from "./lib/dungeon-loot.ts";

const pretty = hasFlag("--pretty");

try {
  let armorType: string;
  let className: string | undefined;
  let specName: string | undefined;
  let region = "us";

  const classArg = getArg("--class");

  if (classArg) {
    // Class-only mode — no character lookup needed
    className = normalizeClass(classArg);
    armorType = getArmorType(className);
    const specArg = getArg("--spec");
    specName = specArg ? normalizeSpec(specArg) : undefined;
    region = getArg("--region") ?? "us";
  } else {
    // Character mode — resolve from flags, --character, or active character
    const char = await resolveCharacter();
    region = char.region;

    if (char.class) {
      // Class from YAML — skip profile API call
      className = char.class;
      armorType = getArmorType(className);
      specName = getArg("--spec") ? normalizeSpec(getArg("--spec")!) : char.spec;
    } else {
      // Need profile API to get class
      const api = new WoWAPI(region);
      const profile = await api.getCharacterProfile(char.realm, char.name);
      className = profile.character_class?.name ?? "Unknown";
      armorType = getArmorType(className);
      specName = getArg("--spec") ? normalizeSpec(getArg("--spec")!) : (profile.active_spec?.name ?? char.spec);
    }
  }

  const api = new WoWAPI(region);

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
