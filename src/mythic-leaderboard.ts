#!/usr/bin/env bun
/**
 * mythic-leaderboard.ts — Query Mythic Keystone leaderboards
 *
 * Usage:
 *   ./run src/mythic-leaderboard.ts --realm 11 [--pretty]                              # list leaderboards
 *   ./run src/mythic-leaderboard.ts --realm 11 --dungeon 375 --period 1 [--pretty]     # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";

const realmId = requireArg("--realm", "Connected realm ID");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const dungeonId = getArg("--dungeon");
  const period = getArg("--period");

  if (dungeonId && period) {
    data = await api.getMythicLeaderboard(
      parseInt(realmId, 10),
      parseInt(dungeonId, 10),
      parseInt(period, 10)
    );
  } else {
    data = await api.getMythicLeaderboardIndex(parseInt(realmId, 10));
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
