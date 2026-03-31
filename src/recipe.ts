#!/usr/bin/env bun
/**
 * recipe.ts — Get recipe details by ID
 *
 * Usage:
 *   ./run src/recipe.ts --id 12345 [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { requireArg, getArg, hasFlag, output } from "./utils.ts";

const id = parseInt(requireArg("--id", "Recipe ID"), 10);
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const data = await api.getRecipe(id);
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
