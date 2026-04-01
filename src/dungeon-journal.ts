#!/usr/bin/env bun
/**
 * dungeon-journal.ts — Query dungeon journal data (dungeons, encounters, mechanics, loot)
 *
 * Usage:
 *   ./run src/dungeon-journal.ts --dungeons [--pretty]                                              # list all dungeons
 *   ./run src/dungeon-journal.ts --season-dungeons [--pretty]                                       # current M+ rotation
 *   ./run src/dungeon-journal.ts --expansion-id 505 [--pretty]                                      # dungeons for an expansion
 *   ./run src/dungeon-journal.ts --search "priory" [--pretty]                                       # search dungeons by name
 *   ./run src/dungeon-journal.ts --dungeon-id 1234 [--pretty]                                       # dungeon overview + bosses
 *   ./run src/dungeon-journal.ts --boss-id 2902 [--pretty]                                          # encounter mechanics
 *   ./run src/dungeon-journal.ts --dungeon-id 1234 --loot --difficulty mythic [--pretty]             # M0 loot
 *   ./run src/dungeon-journal.ts --dungeon-id 1234 --loot --key-level 10 [--pretty]                 # M+10 loot with vault ilvl
 *   ./run src/dungeon-journal.ts --dungeon-id 1234 --loot --key-level 10 --class monk --spec ww     # class-filtered M+ loot
 *   ./run src/dungeon-journal.ts --boss-id 2902 --loot --difficulty heroic [--pretty]                # boss loot at heroic
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";
import { getArmorType, normalizeClass, normalizeSpec } from "./lib/class-meta.ts";
import {
  listDungeons,
  listExpansionDungeons,
  listSeasonDungeons,
  searchDungeon,
  getDungeonDetail,
  getEncounterDetail,
  getDungeonLootEnriched,
} from "./lib/dungeon-journal.ts";
import { isItemForClass } from "./lib/class-meta.ts";
import { resolveDungeonItemIlvls } from "./lib/item-difficulty.ts";
import { loadSeason } from "./lib/season.ts";

const pretty = hasFlag("--pretty");
const seasonSlug = getArg("--season");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const dungeonId = getArg("--dungeon-id");
  const bossId = getArg("--boss-id");
  const expansionId = getArg("--expansion-id");
  const search = getArg("--search");
  const wantLoot = hasFlag("--loot");
  const classArg = getArg("--class");
  const specArg = getArg("--spec");
  const difficulty = getArg("--difficulty");
  const keyLevelArg = getArg("--key-level");
  const keyLevel = keyLevelArg ? parseInt(keyLevelArg, 10) : undefined;

  if (dungeonId) {
    const id = parseInt(dungeonId, 10);
    if (wantLoot) {
      const className = classArg ? normalizeClass(classArg) : undefined;
      const specName = specArg && className ? normalizeSpec(specArg) : undefined;
      const loot = await getDungeonLootEnriched(api, id, {
        className,
        specName,
        difficulty: keyLevel != null ? undefined : (difficulty ?? "mythic"),
        keyLevel,
        seasonSlug,
      });
      const totalItems = loot.reduce((sum, b) => sum + b.items.length, 0);
      const result: any = {
        ...(keyLevel != null ? { key_level: keyLevel } : { difficulty: difficulty ?? "mythic" }),
        ...(className ? { class: className, armor_type: getArmorType(className) } : {}),
        ...(specName ? { spec: specName } : {}),
        bosses: loot,
        total_items: totalItems,
      };
      output(result, pretty);
    } else {
      const detail = await getDungeonDetail(api, id);
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

      // Resolve ilvls
      const ilvlMap = await resolveDungeonItemIlvls(
        items.map((i: any) => i.id),
        { difficulty: keyLevel != null ? undefined : (difficulty ?? "mythic"), keyLevel, seasonSlug },
      );
      for (const item of items) {
        const resolved = ilvlMap.get(item.id);
        if (resolved) {
          if (keyLevel != null) {
            item.end_of_dungeon_ilvl = resolved.ilvl;
            item.vault_ilvl = resolved.vault_ilvl;
            item.vault_track = resolved.vault_track;
            item.vault_rank = resolved.vault_rank;
            item.vault_upgrade_range = resolved.vault_upgrade_range;
          } else {
            item.difficulty_ilvl = resolved.ilvl;
          }
          item.track = resolved.track;
          item.rank = resolved.rank;
          item.upgrade_range = resolved.upgrade_range;
          item.crest = resolved.crest;
        }
      }

      const armorType = className ? getArmorType(className) : undefined;
      output({
        encounter: encounter.name,
        ...(keyLevel != null ? { key_level: keyLevel } : { difficulty: difficulty ?? "mythic" }),
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
    const dungeons = await listExpansionDungeons(api, parseInt(expansionId, 10));
    output({ expansion_id: parseInt(expansionId, 10), dungeons }, pretty);
  } else if (search) {
    const results = await searchDungeon(api, search);
    output({ query: search, results }, pretty);
  } else if (hasFlag("--season-dungeons")) {
    const dungeons = await listSeasonDungeons(seasonSlug);
    output({ dungeons }, pretty);
  } else if (hasFlag("--dungeons")) {
    const dungeons = await listDungeons(api);
    output({ dungeons }, pretty);
  } else {
    console.error(JSON.stringify({
      error: "Provide --dungeons, --season-dungeons, --expansion-id, --search, --dungeon-id, or --boss-id",
    }));
    process.exit(1);
  }
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
