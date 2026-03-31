#!/usr/bin/env bun
/**
 * keystone-affix.ts — List/get Mythic Keystone affixes
 *
 * Usage:
 *   ./run src/keystone-affix.ts [--pretty]                    # list all
 *   ./run src/keystone-affix.ts --id 1 [--pretty]             # get specific
 *   ./run src/keystone-affix.ts --id 1 --media [--pretty]     # get media
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
    const affixId = parseInt(id, 10);
    data = media
      ? await api.getKeystoneAffixMedia(affixId)
      : await api.getKeystoneAffix(affixId);
  } else {
    data = await api.getKeystoneAffixIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
