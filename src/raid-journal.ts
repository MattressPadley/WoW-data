#!/usr/bin/env bun
/**
 * raid-journal.ts — Query raid journal data (raids, encounters, mechanics, loot)
 *
 * Usage:
 *   ./run src/raid-journal.ts --raids [--pretty]                                              # list all raids
 *   ./run src/raid-journal.ts --expansion-id 505 [--pretty]                                   # raids for an expansion
 *   ./run src/raid-journal.ts --search "nerub" [--pretty]                                     # search raids by name
 *   ./run src/raid-journal.ts --raid-id 1273 [--pretty]                                       # raid overview + encounters
 *   ./run src/raid-journal.ts --boss-id 2902 [--pretty]                                       # encounter mechanics
 *   ./run src/raid-journal.ts --raid-id 1273 --loot [--difficulty normal] [--pretty]           # all raid loot
 *   ./run src/raid-journal.ts --raid-id 1273 --loot --class monk [--pretty]                   # loot filtered by class
 *   ./run src/raid-journal.ts --raid-id 1273 --loot --class monk --spec ww [--pretty]         # loot filtered by spec
 *   ./run src/raid-journal.ts --boss-id 2902 --loot --difficulty heroic [--pretty]             # boss loot at heroic ilvl
 *   ./run src/raid-journal.ts --boss-id 2902 --loot --class paladin --difficulty mythic        # class + difficulty
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";
import {
  listRaids,
  listExpansionRaids,
  searchRaid,
  getRaidDetail,
  getEncounterDetail,
  getRaidLoot,
} from "./lib/raid-journal.ts";
import { getArmorType, isUniversalSlot, isItemForClass, normalizeClass, normalizeSpec } from "./lib/class-meta.ts";
import { resolveItemDifficultyIlvls } from "./lib/item-difficulty.ts";
import { loadSeason } from "./lib/season.ts";

const pretty = hasFlag("--pretty");
const noCache = hasFlag("--no-cache");
const seasonSlug = getArg("--season");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const raidId = getArg("--raid-id");
  const bossId = getArg("--boss-id");
  const expansionId = getArg("--expansion-id");
  const search = getArg("--search");
  const wantLoot = hasFlag("--loot");
  const classArg = getArg("--class");
  const specArg = getArg("--spec");
  const difficulty = getArg("--difficulty") ?? "normal";

  if (raidId) {
    const id = parseInt(raidId, 10);
    if (wantLoot) {
      const className = classArg ? normalizeClass(classArg) : undefined;
      const specName = specArg && className ? normalizeSpec(specArg) : undefined;
      const loot = await getRaidLoot(api, id, { className, specName, difficulty, noCache, seasonSlug });
      const totalItems = loot.reduce((sum, b) => sum + b.items.length, 0);
      output({
        difficulty,
        ...(className ? { class: className, armor_type: getArmorType(className) } : {}),
        ...(specName ? { spec: specName } : {}),
        bosses: loot,
        total_items: totalItems,
      }, pretty);
    } else {
      const detail = await getRaidDetail(api, id);
      output(detail, pretty);
    }
  } else if (bossId) {
    const id = parseInt(bossId, 10);
    if (wantLoot) {
      const encounter = await api.getJournalEncounter(id);
      const className = classArg ? normalizeClass(classArg) : undefined;
      const specName = specArg && className ? normalizeSpec(specArg) : undefined;
      const rawItems = (encounter.items ?? [])
        .filter((item: any) => item?.item?.id)
        .map((item: any) => ({ id: item.item.id, name: item.item.name ?? "Unknown" }));

      const armorType = className ? getArmorType(className) : undefined;
      let tierTokenPrefixes: Record<string, string> | undefined;
      if (className) {
        try {
          const season = await loadSeason(seasonSlug);
          tierTokenPrefixes = season.tier_token_prefixes;
        } catch { /* no seasonal data */ }
      }
      const items: any[] = [];
      for (const raw of rawItems) {
        try {
          const item = await api.getItem(raw.id);
          const slot = item.inventory_type?.name;
          if (!slot) continue;
          const subclass = item.item_subclass?.name;
          const itemClassName = item.item_class?.name;
          if (className) {
            const itemStats = (item.preview_item?.stats ?? []).map((s: any) => s.type?.name).filter(Boolean);
            const keep = isItemForClass(className, {
              itemClass: itemClassName ?? "",
              itemSubclass: subclass ?? "",
              slot,
              stats: itemStats,
              name: item.name ?? raw.name,
            }, tierTokenPrefixes, specName);
            if (!keep) continue;
          }
          const preview = item.preview_item ?? {};
          items.push({
            id: raw.id,
            name: item.name ?? raw.name,
            quality: preview.quality?.name ?? item.quality?.name ?? "Unknown",
            ilvl: preview.level?.value ?? item.level ?? 0,
            slot,
            armor_type: subclass ?? "Universal",
            stats: (preview.stats ?? []).map((s: any) => ({
              name: s.type?.name ?? "Unknown",
              value: s.value ?? 0,
            })),
            effects: (preview.spells ?? []).map((s: any) => s.description).filter(Boolean),
            binding: preview.binding?.name ?? "",
            description: preview.description ?? item.description ?? "",
          });
        } catch { /* skip items we can't fetch */ }
      }

      // Resolve difficulty ilvls via seasonal data
      // Boss position defaults to 1 for single-boss queries
      const bossPositions = new Map<number, number>();
      for (const item of items) bossPositions.set(item.id, 1);
      const ilvlMap = await resolveItemDifficultyIlvls(
        items.map((i: any) => i.id), difficulty, bossPositions, seasonSlug,
      );
      for (const item of items) {
        const resolved = ilvlMap.get(item.id);
        if (resolved) {
          item.difficulty_ilvl = resolved.ilvl;
          item.track = resolved.track;
          item.rank = resolved.rank;
          item.upgrade_range = resolved.upgrade_range;
        }
      }

      output({
        encounter: encounter.name,
        difficulty,
        ...(className ? { class: className, armor_type: armorType } : {}),
        ...(specName ? { spec: specName } : {}),
        items,
        total_items: items.length,
      }, pretty);
    } else {
      const detail = await getEncounterDetail(api, id);
      output(detail, pretty);
    }
  } else if (expansionId) {
    const raids = await listExpansionRaids(api, parseInt(expansionId, 10));
    output({ expansion_id: parseInt(expansionId, 10), raids }, pretty);
  } else if (search) {
    const results = await searchRaid(api, search);
    output({ query: search, results }, pretty);
  } else if (hasFlag("--raids")) {
    const raids = await listRaids(api);
    output({ raids }, pretty);
  } else {
    console.error(JSON.stringify({
      error: "Provide --raids, --expansion-id, --search, --raid-id, or --boss-id",
    }));
    process.exit(1);
  }
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
