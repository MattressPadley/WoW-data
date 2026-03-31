#!/usr/bin/env bun
/**
 * auctions.ts — Fetch per-realm auction house data
 *
 * Usage:
 *   ./run src/auctions.ts --realm 11 [--pretty]
 *
 * Note: Use connected-realm.ts to find connected realm IDs.
 * For region-wide commodities, use commodities.ts instead.
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";

const realmId = requireArg("--realm", "Connected realm ID");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const data = await api.getAHRealmAuctions(parseInt(realmId, 10));
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
