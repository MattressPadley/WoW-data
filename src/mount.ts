#!/usr/bin/env bun
/**
 * mount.ts — List/get mounts
 *
 * Usage:
 *   ./run src/mount.ts [--pretty]              # list all
 *   ./run src/mount.ts --id 6 [--pretty]       # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getMount(parseInt(id, 10))
    : await api.getMountIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
