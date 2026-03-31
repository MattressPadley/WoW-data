#!/usr/bin/env bun
/**
 * playable-class.ts — List/get playable classes
 *
 * Usage:
 *   ./run src/playable-class.ts [--pretty]                         # list all
 *   ./run src/playable-class.ts --id 1 [--pretty]                  # get specific
 *   ./run src/playable-class.ts --id 1 --media [--pretty]          # get media
 *   ./run src/playable-class.ts --id 1 --pvp-talent-slots [--pretty]  # get PvP talent slots
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  if (id) {
    const classId = parseInt(id, 10);
    if (hasFlag("--media")) {
      data = await api.getPlayableClassMedia(classId);
    } else if (hasFlag("--pvp-talent-slots")) {
      data = await api.getPlayableClassPvpTalentSlots(classId);
    } else {
      data = await api.getPlayableClass(classId);
    }
  } else {
    data = await api.getPlayableClassIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
