#!/usr/bin/env bun
/**
 * heirloom.ts — List/get heirlooms
 *
 * Usage:
 *   ./run src/heirloom.ts [--pretty]              # list all
 *   ./run src/heirloom.ts --id 1 [--pretty]       # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getHeirloom(parseInt(id, 10))
    : await api.getHeirloomIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
