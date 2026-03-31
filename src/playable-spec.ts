#!/usr/bin/env bun
/**
 * playable-spec.ts — List/get playable specializations
 *
 * Usage:
 *   ./run src/playable-spec.ts [--pretty]                    # list all
 *   ./run src/playable-spec.ts --id 262 [--pretty]           # get specific
 *   ./run src/playable-spec.ts --id 262 --media [--pretty]   # get media
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
    const specId = parseInt(id, 10);
    data = media
      ? await api.getPlayableSpecializationMedia(specId)
      : await api.getPlayableSpecialization(specId);
  } else {
    data = await api.getPlayableSpecializationIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
