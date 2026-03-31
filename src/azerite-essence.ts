#!/usr/bin/env bun
/**
 * azerite-essence.ts — List/get Azerite Essences
 *
 * Usage:
 *   ./run src/azerite-essence.ts [--pretty]                    # list all
 *   ./run src/azerite-essence.ts --id 2 [--pretty]             # get specific
 *   ./run src/azerite-essence.ts --id 2 --media [--pretty]     # get media
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
    const essenceId = parseInt(id, 10);
    data = media
      ? await api.getAzeriteEssenceMedia(essenceId)
      : await api.getAzeriteEssence(essenceId);
  } else {
    data = await api.getAzeriteEssenceIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
