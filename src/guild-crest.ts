#!/usr/bin/env bun
/**
 * guild-crest.ts — Query guild crest components
 *
 * Usage:
 *   ./run src/guild-crest.ts [--pretty]                    # list components
 *   ./run src/guild-crest.ts --border-id 0 [--pretty]      # get border media
 *   ./run src/guild-crest.ts --emblem-id 0 [--pretty]      # get emblem media
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const borderId = getArg("--border-id");
  const emblemId = getArg("--emblem-id");

  if (borderId) {
    data = await api.getGuildCrestBorderMedia(parseInt(borderId, 10));
  } else if (emblemId) {
    data = await api.getGuildCrestEmblemMedia(parseInt(emblemId, 10));
  } else {
    data = await api.getGuildCrestIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
