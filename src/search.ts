#!/usr/bin/env bun
/**
 * search.ts — Search for items by name
 *
 * Usage:
 *   ./run src/search.ts --name "Spark" [--limit 10] [--page 1] [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { requireArg, getArg, hasFlag, output } from "./utils.ts";

const name = requireArg("--name", "Item name");
const limit = parseInt(getArg("--limit") ?? "100", 10);
const page = parseInt(getArg("--page") ?? "1", 10);
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const results = await api.searchItems(name, limit, page);
  output(results, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
