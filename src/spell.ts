#!/usr/bin/env bun
/**
 * spell.ts — Get spell data by ID
 *
 * Usage:
 *   ./run src/spell.ts --id 196607 [--pretty]             # get spell
 *   ./run src/spell.ts --id 196607 --media [--pretty]     # get spell media
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";

const id = requireArg("--id", "Spell ID");
const media = hasFlag("--media");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const spellId = parseInt(id, 10);

  const data = media
    ? await api.getSpellMedia(spellId)
    : await api.getSpell(spellId);

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
