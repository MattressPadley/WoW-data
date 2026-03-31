#!/usr/bin/env bun
/**
 * tech-talent.ts — Query tech talent data (trees and talents)
 *
 * Usage:
 *   ./run src/tech-talent.ts [--pretty]                        # list talents
 *   ./run src/tech-talent.ts --id 863 [--pretty]               # get talent
 *   ./run src/tech-talent.ts --id 863 --media [--pretty]       # get talent media
 *   ./run src/tech-talent.ts --trees [--pretty]                # list trees
 *   ./run src/tech-talent.ts --tree-id 275 [--pretty]          # get tree
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const treeId = getArg("--tree-id");

  if (treeId) {
    data = await api.getTechTalentTree(parseInt(treeId, 10));
  } else if (hasFlag("--trees")) {
    data = await api.getTechTalentTreeIndex();
  } else if (id) {
    const talentId = parseInt(id, 10);
    data = hasFlag("--media")
      ? await api.getTechTalentMedia(talentId)
      : await api.getTechTalent(talentId);
  } else {
    data = await api.getTechTalentIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
