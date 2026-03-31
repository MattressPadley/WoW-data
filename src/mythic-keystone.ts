#!/usr/bin/env bun
/**
 * mythic-keystone.ts — Query Mythic Keystone data (dungeons, periods, seasons)
 *
 * Usage:
 *   ./run src/mythic-keystone.ts [--pretty]                        # keystone index
 *   ./run src/mythic-keystone.ts --dungeons [--pretty]             # list dungeons
 *   ./run src/mythic-keystone.ts --dungeon-id 375 [--pretty]       # get dungeon
 *   ./run src/mythic-keystone.ts --periods [--pretty]              # list periods
 *   ./run src/mythic-keystone.ts --period-id 1 [--pretty]          # get period
 *   ./run src/mythic-keystone.ts --seasons [--pretty]              # list seasons
 *   ./run src/mythic-keystone.ts --season-id 1 [--pretty]          # get season
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const dungeonId = getArg("--dungeon-id");
  const periodId = getArg("--period-id");
  const seasonId = getArg("--season-id");

  if (dungeonId) {
    data = await api.getMythicKeystoneDungeon(parseInt(dungeonId, 10));
  } else if (hasFlag("--dungeons")) {
    data = await api.getMythicKeystoneDungeonIndex();
  } else if (periodId) {
    data = await api.getMythicKeystonePeriod(parseInt(periodId, 10));
  } else if (hasFlag("--periods")) {
    data = await api.getMythicKeystonePeriodIndex();
  } else if (seasonId) {
    data = await api.getMythicKeystoneSeason(parseInt(seasonId, 10));
  } else if (hasFlag("--seasons")) {
    data = await api.getMythicKeystoneSeasonIndex();
  } else {
    data = await api.getMythicKeystoneIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
