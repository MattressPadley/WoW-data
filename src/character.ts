#!/usr/bin/env bun
/**
 * character.ts — Query character profile data
 *
 * Usage:
 *   ./run src/character.ts --realm tichondrius --name thrall [--pretty]                     # profile summary
 *   ./run src/character.ts --realm tichondrius --name thrall --status [--pretty]             # character status
 *   ./run src/character.ts --realm tichondrius --name thrall --equipment [--pretty]          # equipment
 *   ./run src/character.ts --realm tichondrius --name thrall --achievements [--pretty]       # achievements
 *   ./run src/character.ts --realm tichondrius --name thrall --achievements --stats [--pretty] # achievement statistics
 *   ./run src/character.ts --realm tichondrius --name thrall --appearance [--pretty]         # appearance
 *   ./run src/character.ts --realm tichondrius --name thrall --collections [--pretty]        # all collections
 *   ./run src/character.ts --realm tichondrius --name thrall --collections --mounts          # mount collection
 *   ./run src/character.ts --realm tichondrius --name thrall --collections --pets            # pet collection
 *   ./run src/character.ts --realm tichondrius --name thrall --collections --toys            # toy collection
 *   ./run src/character.ts --realm tichondrius --name thrall --collections --heirlooms       # heirloom collection
 *   ./run src/character.ts --realm tichondrius --name thrall --collections --transmogs       # transmog collection
 *   ./run src/character.ts --realm tichondrius --name thrall --encounters [--pretty]         # all encounters
 *   ./run src/character.ts --realm tichondrius --name thrall --encounters --dungeons         # dungeon encounters
 *   ./run src/character.ts --realm tichondrius --name thrall --encounters --raids            # raid encounters
 *   ./run src/character.ts --realm tichondrius --name thrall --media [--pretty]              # character media
 *   ./run src/character.ts --realm tichondrius --name thrall --mythic-keystone [--pretty]    # M+ profile
 *   ./run src/character.ts --realm tichondrius --name thrall --mythic-keystone --season 12   # M+ season
 *   ./run src/character.ts --realm tichondrius --name thrall --professions [--pretty]        # professions
 *   ./run src/character.ts --realm tichondrius --name thrall --pvp [--pretty]                # PvP summary
 *   ./run src/character.ts --realm tichondrius --name thrall --pvp --bracket 2v2             # PvP bracket
 *   ./run src/character.ts --realm tichondrius --name thrall --quests [--pretty]             # quests
 *   ./run src/character.ts --realm tichondrius --name thrall --quests --completed            # completed quests
 *   ./run src/character.ts --realm tichondrius --name thrall --reputations [--pretty]        # reputations
 *   ./run src/character.ts --realm tichondrius --name thrall --soulbinds [--pretty]          # soulbinds
 *   ./run src/character.ts --realm tichondrius --name thrall --specializations [--pretty]    # specializations
 *   ./run src/character.ts --realm tichondrius --name thrall --statistics [--pretty]         # combat statistics
 *   ./run src/character.ts --realm tichondrius --name thrall --titles [--pretty]             # titles
 *   ./run src/character.ts --realm tichondrius --name thrall --hunter-pets [--pretty]        # hunter pets
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const realm = requireArg("--realm", "realm slug");
  const name = requireArg("--name", "character name");

  let data: any;

  if (hasFlag("--achievements")) {
    data = hasFlag("--stats")
      ? await api.getCharacterAchievementStatistics(realm, name)
      : await api.getCharacterAchievements(realm, name);
  } else if (hasFlag("--appearance")) {
    data = await api.getCharacterAppearance(realm, name);
  } else if (hasFlag("--collections")) {
    if (hasFlag("--mounts")) {
      data = await api.getCharacterMountsCollection(realm, name);
    } else if (hasFlag("--pets")) {
      data = await api.getCharacterPetsCollection(realm, name);
    } else if (hasFlag("--toys")) {
      data = await api.getCharacterToysCollection(realm, name);
    } else if (hasFlag("--heirlooms")) {
      data = await api.getCharacterHeirloomsCollection(realm, name);
    } else if (hasFlag("--transmogs")) {
      data = await api.getCharacterTransmogCollection(realm, name);
    } else {
      data = await api.getCharacterCollections(realm, name);
    }
  } else if (hasFlag("--encounters")) {
    if (hasFlag("--dungeons")) {
      data = await api.getCharacterDungeons(realm, name);
    } else if (hasFlag("--raids")) {
      data = await api.getCharacterRaids(realm, name);
    } else {
      data = await api.getCharacterEncounters(realm, name);
    }
  } else if (hasFlag("--equipment")) {
    data = await api.getCharacterEquipment(realm, name);
  } else if (hasFlag("--hunter-pets")) {
    data = await api.getCharacterHunterPets(realm, name);
  } else if (hasFlag("--media")) {
    data = await api.getCharacterMedia(realm, name);
  } else if (hasFlag("--mythic-keystone")) {
    const season = getArg("--season");
    data = season
      ? await api.getCharacterMythicKeystoneSeason(realm, name, parseInt(season, 10))
      : await api.getCharacterMythicKeystoneProfile(realm, name);
  } else if (hasFlag("--professions")) {
    data = await api.getCharacterProfessions(realm, name);
  } else if (hasFlag("--pvp")) {
    const bracket = getArg("--bracket");
    data = bracket
      ? await api.getCharacterPvpBracket(realm, name, bracket)
      : await api.getCharacterPvpSummary(realm, name);
  } else if (hasFlag("--quests")) {
    data = hasFlag("--completed")
      ? await api.getCharacterCompletedQuests(realm, name)
      : await api.getCharacterQuests(realm, name);
  } else if (hasFlag("--reputations")) {
    data = await api.getCharacterReputations(realm, name);
  } else if (hasFlag("--soulbinds")) {
    data = await api.getCharacterSoulbinds(realm, name);
  } else if (hasFlag("--specializations")) {
    data = await api.getCharacterSpecializations(realm, name);
  } else if (hasFlag("--statistics")) {
    data = await api.getCharacterStatistics(realm, name);
  } else if (hasFlag("--titles")) {
    data = await api.getCharacterTitles(realm, name);
  } else if (hasFlag("--status")) {
    data = await api.getCharacterProfileStatus(realm, name);
  } else {
    data = await api.getCharacterProfile(realm, name);
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
