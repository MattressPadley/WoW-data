#!/usr/bin/env bun
/**
 * power-type.ts — List/get power types (mana, rage, energy, etc.)
 *
 * Usage:
 *   ./run src/power-type.ts [--pretty]              # list all
 *   ./run src/power-type.ts --id 0 [--pretty]       # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getPowerType(parseInt(id, 10))
    : await api.getPowerTypeIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
