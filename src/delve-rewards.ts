#!/usr/bin/env bun
/**
 * delve-rewards.ts — Look up delve reward ilvl by bountiful tier
 *
 * Usage:
 *   ./run src/delve-rewards.ts --tier 8 [--pretty] [--season <slug>]
 *   ./run src/delve-rewards.ts --table [--pretty] [--season <slug>]
 */

import { getArg, hasFlag, output } from "./utils.ts";
import { loadSeason, getDelveIlvl } from "./lib/season.ts";

const pretty = hasFlag("--pretty");

try {
  const season = await loadSeason(getArg("--season") ?? undefined);

  if (hasFlag("--table")) {
    const rows = [];
    for (let t = 1; t <= 11; t++) {
      const result = getDelveIlvl(season, t);
      if (result) rows.push({ tier: t, ...result });
    }
    output(rows, pretty);
  } else {
    const tierStr = getArg("--tier");
    if (!tierStr) {
      console.error(JSON.stringify({ error: "Provide --tier <N> or --table" }));
      process.exit(1);
    }
    const tier = parseInt(tierStr, 10);
    const result = getDelveIlvl(season, tier);
    if (!result) {
      console.error(JSON.stringify({ error: `No delve reward data for tier ${tier}` }));
      process.exit(1);
    }
    output({ tier, ...result }, pretty);
  }
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
