#!/usr/bin/env bun
/**
 * pvp-tier.ts — List/get PvP tiers
 *
 * Usage:
 *   ./run src/pvp-tier.ts [--pretty]                    # list all
 *   ./run src/pvp-tier.ts --id 1 [--pretty]             # get specific
 *   ./run src/pvp-tier.ts --id 1 --media [--pretty]     # get media
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const media = hasFlag("--media");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  if (id) {
    const tierId = parseInt(id, 10);
    data = media
      ? await api.getPvpTierMedia(tierId)
      : await api.getPvpTier(tierId);
  } else {
    data = await api.getPvpTierIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
