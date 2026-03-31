#!/usr/bin/env bun
/**
 * profession-tier.ts — Get profession skill tier data
 *
 * Usage:
 *   ./run src/profession-tier.ts --profession 164 --tier 2871 [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { requireArg, getArg, hasFlag, output } from "./utils.ts";

const professionId = parseInt(requireArg("--profession", "Profession ID"), 10);
const tierId = parseInt(requireArg("--tier", "Skill tier ID"), 10);
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const data = await api.getProfessionSkillTier(professionId, tierId);
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
