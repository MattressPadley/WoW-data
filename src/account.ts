#!/usr/bin/env bun
/**
 * account.ts — Query account-level profile data (requires authorization code token)
 *
 * Requires a profile-scoped token: ./run src/oauth.ts --profile
 *
 * Usage:
 *   ./run src/account.ts [--pretty]                                              # account profile summary
 *   ./run src/account.ts --protected-character --realm-id 1 --character-id 12345 [--pretty] # protected character
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;

  if (hasFlag("--protected-character")) {
    const realmId = parseInt(requireArg("--realm-id", "realm ID"), 10);
    const characterId = parseInt(requireArg("--character-id", "character ID"), 10);
    data = await api.getProtectedCharacter(realmId, characterId);
  } else {
    data = await api.getAccountProfile();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
