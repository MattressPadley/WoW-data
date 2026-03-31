#!/usr/bin/env bun
/**
 * item-set.ts — List item sets or get a specific one
 *
 * Usage:
 *   ./run src/item-set.ts [--pretty]            # list all sets
 *   ./run src/item-set.ts --id 1 [--pretty]     # get specific set
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getItemSet(parseInt(id, 10))
    : await api.getItemSetsIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
