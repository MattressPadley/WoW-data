#!/usr/bin/env bun
/**
 * mythic-raid-leaderboard.ts — Get Mythic Raid Hall of Fame leaderboard
 *
 * Usage:
 *   ./run src/mythic-raid-leaderboard.ts --raid "nerubar-palace" --faction horde [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";

const raid = requireArg("--raid", "Raid slug");
const faction = requireArg("--faction", "Faction (horde/alliance)");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const data = await api.getMythicRaidLeaderboard(raid, faction);
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
