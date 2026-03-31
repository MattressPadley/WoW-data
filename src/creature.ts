#!/usr/bin/env bun
/**
 * creature.ts — Query creature data (families, types, creatures)
 *
 * Usage:
 *   ./run src/creature.ts --id 42722 [--pretty]                # get creature
 *   ./run src/creature.ts --families [--pretty]                # list families
 *   ./run src/creature.ts --family-id 1 [--pretty]             # get family
 *   ./run src/creature.ts --family-id 1 --media [--pretty]     # get family media
 *   ./run src/creature.ts --types [--pretty]                   # list types
 *   ./run src/creature.ts --type-id 1 [--pretty]               # get type
 *   ./run src/creature.ts --display-media 49 [--pretty]        # get display media
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const familyId = getArg("--family-id");
  const typeId = getArg("--type-id");
  const displayMedia = getArg("--display-media");

  if (displayMedia) {
    data = await api.getCreatureDisplayMedia(parseInt(displayMedia, 10));
  } else if (typeId) {
    data = await api.getCreatureType(parseInt(typeId, 10));
  } else if (hasFlag("--types")) {
    data = await api.getCreatureTypeIndex();
  } else if (familyId) {
    const fid = parseInt(familyId, 10);
    data = hasFlag("--media")
      ? await api.getCreatureFamilyMedia(fid)
      : await api.getCreatureFamily(fid);
  } else if (hasFlag("--families")) {
    data = await api.getCreatureFamilyIndex();
  } else if (id) {
    data = await api.getCreature(parseInt(id, 10));
  } else {
    console.error(JSON.stringify({ error: "Provide --id, --families, --family-id, --types, --type-id, or --display-media" }));
    process.exit(1);
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
