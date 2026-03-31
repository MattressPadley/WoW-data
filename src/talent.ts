#!/usr/bin/env bun
/**
 * talent.ts — Query talent data (trees, talents, PvP talents)
 *
 * Usage:
 *   ./run src/talent.ts [--pretty]                                         # list talent trees
 *   ./run src/talent.ts --tree-id 786 --spec-id 262 [--pretty]            # get tree for spec
 *   ./run src/talent.ts --tree-id 786 [--pretty]                           # get tree nodes
 *   ./run src/talent.ts --talents [--pretty]                               # list talents
 *   ./run src/talent.ts --id 117163 [--pretty]                             # get talent
 *   ./run src/talent.ts --pvp-talents [--pretty]                           # list PvP talents
 *   ./run src/talent.ts --pvp-talent-id 11 [--pretty]                      # get PvP talent
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const treeId = getArg("--tree-id");
  const specId = getArg("--spec-id");
  const id = getArg("--id");
  const pvpTalentId = getArg("--pvp-talent-id");

  if (pvpTalentId) {
    data = await api.getPvpTalent(parseInt(pvpTalentId, 10));
  } else if (hasFlag("--pvp-talents")) {
    data = await api.getPvpTalentIndex();
  } else if (id) {
    data = await api.getTalent(parseInt(id, 10));
  } else if (hasFlag("--talents")) {
    data = await api.getTalentIndex();
  } else if (treeId && specId) {
    data = await api.getTalentTree(parseInt(treeId, 10), parseInt(specId, 10));
  } else if (treeId) {
    data = await api.getTalentTreeNodes(parseInt(treeId, 10));
  } else {
    data = await api.getTalentTreeIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
