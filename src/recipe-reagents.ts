#!/usr/bin/env bun
/**
 * recipe-reagents.ts — Get recipe reagent items and quantities
 *
 * Combines Blizzard API recipe data with wago.tools DB2 CSV exports
 * to resolve actual reagent items and quantities for any recipe,
 * including modern (Dragonflight+) modified crafting recipes.
 *
 * Usage:
 *   ./run src/recipe-reagents.ts --id 53044 [--pretty] [--no-cache]
 */

import { WoWAPI } from "./api.ts";
import { requireArg, getArg, hasFlag, output } from "./utils.ts";
import { resolveRecipeReagents } from "./lib/recipe-reagents.ts";

const id = parseInt(requireArg("--id", "Recipe ID"), 10);
const pretty = hasFlag("--pretty");
const noCache = hasFlag("--no-cache");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const result = await resolveRecipeReagents(api, id, noCache);

  const { type: _, ...data } = result;
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
