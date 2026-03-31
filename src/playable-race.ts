#!/usr/bin/env bun
/**
 * playable-race.ts — List/get playable races
 *
 * Usage:
 *   ./run src/playable-race.ts [--pretty]              # list all
 *   ./run src/playable-race.ts --id 1 [--pretty]       # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getPlayableRace(parseInt(id, 10))
    : await api.getPlayableRaceIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
