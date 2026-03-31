#!/usr/bin/env bun
/**
 * professions.ts — List all professions or get a specific one
 *
 * Usage:
 *   ./run src/professions.ts [--pretty]              # list all
 *   ./run src/professions.ts --id 164 [--pretty]     # get specific profession
 *   ./run src/professions.ts --id 164 --media [--pretty]  # get profession media
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
    const professionId = parseInt(id, 10);
    data = media
      ? await api.getProfessionMedia(professionId)
      : await api.getProfession(professionId);
  } else {
    data = await api.getProfessionsIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
