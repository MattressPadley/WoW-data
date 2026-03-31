#!/usr/bin/env bun
/**
 * title.ts — List/get titles
 *
 * Usage:
 *   ./run src/title.ts [--pretty]              # list all
 *   ./run src/title.ts --id 1 [--pretty]       # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getTitle(parseInt(id, 10))
    : await api.getTitleIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
