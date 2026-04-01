#!/usr/bin/env bun
/**
 * season.ts — Manage seasonal data (upgrade tracks, ilvl mappings)
 *
 * Usage:
 *   ./run src/season.ts --bootstrap --slug midnight-s1 --raid-id 1314 [--item-id 249343] [--pretty]
 *   ./run src/season.ts --bootstrap --slug midnight-s1 --raid-id 1314 --name "Midnight Season 1" --expansion Midnight --patch 12.0
 *   ./run src/season.ts --info [--pretty]
 *   ./run src/season.ts --set-current midnight-s1
 */

import { getArg, hasFlag, output } from "./utils.ts";
import { WoWAPI } from "./api.ts";
import { loadSeason, bootstrapSeason, setCurrentSeason } from "./lib/season.ts";

const pretty = hasFlag("--pretty");

try {
  if (hasFlag("--bootstrap")) {
    const slug = getArg("--slug");
    const raidId = getArg("--raid-id");
    if (!slug || !raidId) {
      console.error(JSON.stringify({ error: "--bootstrap requires --slug and --raid-id" }));
      process.exit(1);
    }

    // Find a sample equippable item from the raid
    let sampleItemId = getArg("--item-id") ? parseInt(getArg("--item-id")!, 10) : 0;
    if (!sampleItemId) {
      const api = new WoWAPI(getArg("--region") ?? "us");
      const instance = await api.getJournalInstance(parseInt(raidId, 10));
      const encounters = instance.encounters ?? [];
      if (encounters.length === 0) throw new Error("Raid has no encounters");

      // Search encounters for an equippable item
      for (const enc of encounters) {
        const encounter = await api.getJournalEncounter(enc.id);
        for (const item of encounter.items ?? []) {
          if (item?.item?.id) {
            const detail = await api.getItem(item.item.id);
            if (detail.is_equippable) {
              sampleItemId = item.item.id;
              break;
            }
          }
        }
        if (sampleItemId) break;
      }

      if (!sampleItemId) throw new Error("Could not find an equippable item in the raid");
    }

    console.error(`Using sample item ID: ${sampleItemId}`);
    const season = await bootstrapSeason(slug, sampleItemId, {
      noCache: hasFlag("--no-cache"),
      name: getArg("--name"),
      expansion: getArg("--expansion"),
      patch: getArg("--patch"),
    });

    output(season, pretty);
  } else if (hasFlag("--info")) {
    const slug = getArg("--season");
    const season = await loadSeason(slug);
    output(season, pretty);
  } else if (getArg("--set-current")) {
    const slug = getArg("--set-current")!;
    await setCurrentSeason(slug);
    output({ current: slug }, pretty);
  } else {
    console.error(JSON.stringify({ error: "Provide --bootstrap, --info, or --set-current" }));
    process.exit(1);
  }
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
