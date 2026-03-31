#!/usr/bin/env bun
/**
 * commodities.ts — Fetch auction house commodity data
 *
 * Usage:
 *   ./run src/commodities.ts [--pretty]
 *
 * Note: This returns a large dataset (all commodity auctions).
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const data = await api.getAHCommodities();
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
