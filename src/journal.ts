#!/usr/bin/env bun
/**
 * journal.ts — Query journal data (expansions, encounters, instances)
 *
 * Usage:
 *   ./run src/journal.ts --expansions [--pretty]                   # list expansions
 *   ./run src/journal.ts --expansion-id 68 [--pretty]              # get expansion
 *   ./run src/journal.ts --encounters [--pretty]                   # list encounters
 *   ./run src/journal.ts --encounter-id 89 [--pretty]              # get encounter
 *   ./run src/journal.ts --instances [--pretty]                    # list instances
 *   ./run src/journal.ts --instance-id 63 [--pretty]               # get instance
 *   ./run src/journal.ts --instance-id 63 --media [--pretty]       # get instance media
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const expansionId = getArg("--expansion-id");
  const encounterId = getArg("--encounter-id");
  const instanceId = getArg("--instance-id");

  if (instanceId) {
    const iid = parseInt(instanceId, 10);
    data = hasFlag("--media")
      ? await api.getJournalInstanceMedia(iid)
      : await api.getJournalInstance(iid);
  } else if (hasFlag("--instances")) {
    data = await api.getJournalInstanceIndex();
  } else if (encounterId) {
    data = await api.getJournalEncounter(parseInt(encounterId, 10));
  } else if (hasFlag("--encounters")) {
    data = await api.getJournalEncounterIndex();
  } else if (expansionId) {
    data = await api.getJournalExpansion(parseInt(expansionId, 10));
  } else if (hasFlag("--expansions")) {
    data = await api.getJournalExpansionIndex();
  } else {
    console.error(JSON.stringify({ error: "Provide --expansions, --expansion-id, --encounters, --encounter-id, --instances, or --instance-id" }));
    process.exit(1);
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
