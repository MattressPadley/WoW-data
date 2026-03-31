#!/usr/bin/env bun
/**
 * wow-token.ts — Get current WoW Token price
 *
 * Usage:
 *   ./run src/wow-token.ts [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const data = await api.getWoWTokenIndex();
  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
