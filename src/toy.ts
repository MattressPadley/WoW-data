#!/usr/bin/env bun
/**
 * toy.ts — List/get toys
 *
 * Usage:
 *   ./run src/toy.ts [--pretty]              # list all
 *   ./run src/toy.ts --id 30 [--pretty]      # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getToy(parseInt(id, 10))
    : await api.getToyIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
