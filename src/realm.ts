#!/usr/bin/env bun
/**
 * realm.ts — List/get realms
 *
 * Usage:
 *   ./run src/realm.ts [--pretty]                      # list all
 *   ./run src/realm.ts --slug tichondrius [--pretty]    # get specific
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const slug = getArg("--slug");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  const data = slug
    ? await api.getRealm(slug)
    : await api.getRealmIndex();

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
