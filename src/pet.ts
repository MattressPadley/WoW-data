#!/usr/bin/env bun
/**
 * pet.ts — Query battle pet data (pets and abilities)
 *
 * Usage:
 *   ./run src/pet.ts [--pretty]                                # list pets
 *   ./run src/pet.ts --id 39 [--pretty]                        # get pet
 *   ./run src/pet.ts --id 39 --media [--pretty]                # get pet media
 *   ./run src/pet.ts --abilities [--pretty]                    # list abilities
 *   ./run src/pet.ts --ability-id 110 [--pretty]               # get ability
 *   ./run src/pet.ts --ability-id 110 --media [--pretty]       # get ability media
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const abilityId = getArg("--ability-id");

  if (abilityId) {
    const aid = parseInt(abilityId, 10);
    data = hasFlag("--media")
      ? await api.getPetAbilityMedia(aid)
      : await api.getPetAbility(aid);
  } else if (hasFlag("--abilities")) {
    data = await api.getPetAbilityIndex();
  } else if (id) {
    const petId = parseInt(id, 10);
    data = hasFlag("--media")
      ? await api.getPetMedia(petId)
      : await api.getPet(petId);
  } else {
    data = await api.getPetIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
