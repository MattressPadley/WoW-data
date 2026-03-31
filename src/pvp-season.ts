#!/usr/bin/env bun
/**
 * pvp-season.ts — Query PvP season data (seasons, leaderboards, rewards)
 *
 * Usage:
 *   ./run src/pvp-season.ts [--pretty]                                     # list seasons
 *   ./run src/pvp-season.ts --id 33 [--pretty]                             # get season
 *   ./run src/pvp-season.ts --id 33 --leaderboards [--pretty]              # list leaderboards
 *   ./run src/pvp-season.ts --id 33 --leaderboard 3v3 [--pretty]          # get leaderboard
 *   ./run src/pvp-season.ts --id 33 --rewards [--pretty]                   # list rewards
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const leaderboard = getArg("--leaderboard");

  if (id) {
    const seasonId = parseInt(id, 10);
    if (leaderboard) {
      data = await api.getPvpLeaderboard(seasonId, leaderboard);
    } else if (hasFlag("--leaderboards")) {
      data = await api.getPvpLeaderboardIndex(seasonId);
    } else if (hasFlag("--rewards")) {
      data = await api.getPvpRewardIndex(seasonId);
    } else {
      data = await api.getPvpSeason(seasonId);
    }
  } else {
    data = await api.getPvpSeasonIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
