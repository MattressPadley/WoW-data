#!/usr/bin/env bun
/**
 * reputation.ts — Query reputation data (factions and tiers)
 *
 * Usage:
 *   ./run src/reputation.ts [--pretty]                     # list factions
 *   ./run src/reputation.ts --id 21 [--pretty]             # get faction
 *   ./run src/reputation.ts --tiers [--pretty]             # list tiers
 *   ./run src/reputation.ts --tier-id 1 [--pretty]         # get tier
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const tierId = getArg("--tier-id");

  if (tierId) {
    data = await api.getReputationTiers(parseInt(tierId, 10));
  } else if (hasFlag("--tiers")) {
    data = await api.getReputationTiersIndex();
  } else if (id) {
    data = await api.getReputationFaction(parseInt(id, 10));
  } else {
    data = await api.getReputationFactionIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
