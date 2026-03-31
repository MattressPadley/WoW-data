#!/usr/bin/env bun
/**
 * connected-realm.ts — List/get connected realms
 *
 * Usage:
 *   ./run src/connected-realm.ts [--pretty]              # list all
 *   ./run src/connected-realm.ts --id 11 [--pretty]      # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = id
    ? await api.getConnectedRealm(parseInt(id, 10))
    : await api.getConnectedRealmIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
