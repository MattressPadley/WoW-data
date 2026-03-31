#!/usr/bin/env bun
/**
 * covenant.ts — Query Shadowlands covenant data
 *
 * Usage:
 *   ./run src/covenant.ts [--pretty]                           # list covenants
 *   ./run src/covenant.ts --id 1 [--pretty]                    # get covenant
 *   ./run src/covenant.ts --id 1 --media [--pretty]            # get covenant media
 *   ./run src/covenant.ts --soulbinds [--pretty]               # list soulbinds
 *   ./run src/covenant.ts --soulbind-id 1 [--pretty]           # get soulbind
 *   ./run src/covenant.ts --conduits [--pretty]                # list conduits
 *   ./run src/covenant.ts --conduit-id 1 [--pretty]            # get conduit
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const soulbindId = getArg("--soulbind-id");
  const conduitId = getArg("--conduit-id");
  const id = getArg("--id");

  if (conduitId) {
    data = await api.getConduit(parseInt(conduitId, 10));
  } else if (hasFlag("--conduits")) {
    data = await api.getConduitIndex();
  } else if (soulbindId) {
    data = await api.getSoulbind(parseInt(soulbindId, 10));
  } else if (hasFlag("--soulbinds")) {
    data = await api.getSoulbindIndex();
  } else if (id) {
    const covenantId = parseInt(id, 10);
    data = hasFlag("--media")
      ? await api.getCovenantMedia(covenantId)
      : await api.getCovenant(covenantId);
  } else {
    data = await api.getCovenantIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
