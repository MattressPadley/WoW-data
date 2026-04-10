#!/usr/bin/env bun
/**
 * character.ts — Query character profile data and manage saved characters
 *
 * Management:
 *   ./run src/character.ts --add --name treepunch --realm turalyon --class monk --spec ww
 *   ./run src/character.ts --set-active treepunch
 *   ./run src/character.ts --active [--pretty]
 *   ./run src/character.ts --list-saved [--pretty]
 *
 * Queries (uses active character when --realm/--name omitted):
 *   ./run src/character.ts [--pretty]                                   # profile summary
 *   ./run src/character.ts --equipment [--pretty]                       # equipment
 *   ./run src/character.ts --achievements [--pretty]                    # achievements
 *   ./run src/character.ts --achievements --stats [--pretty]            # achievement statistics
 *   ./run src/character.ts --appearance [--pretty]                      # appearance
 *   ./run src/character.ts --collections [--pretty]                     # all collections
 *   ./run src/character.ts --collections --mounts                       # mount collection
 *   ./run src/character.ts --collections --pets                         # pet collection
 *   ./run src/character.ts --collections --toys                         # toy collection
 *   ./run src/character.ts --collections --heirlooms                    # heirloom collection
 *   ./run src/character.ts --collections --transmogs                    # transmog collection
 *   ./run src/character.ts --encounters [--pretty]                      # all encounters
 *   ./run src/character.ts --encounters --dungeons                      # dungeon encounters
 *   ./run src/character.ts --encounters --raids                         # raid encounters
 *   ./run src/character.ts --media [--pretty]                           # character media
 *   ./run src/character.ts --mythic-keystone [--pretty]                 # M+ profile
 *   ./run src/character.ts --mythic-keystone --season 12                # M+ season
 *   ./run src/character.ts --professions [--pretty]                     # professions
 *   ./run src/character.ts --pvp [--pretty]                             # PvP summary
 *   ./run src/character.ts --pvp --bracket 2v2                          # PvP bracket
 *   ./run src/character.ts --quests [--pretty]                          # quests
 *   ./run src/character.ts --quests --completed                         # completed quests
 *   ./run src/character.ts --reputations [--pretty]                     # reputations
 *   ./run src/character.ts --soulbinds [--pretty]                       # soulbinds
 *   ./run src/character.ts --specializations [--pretty]                 # specializations
 *   ./run src/character.ts --statistics [--pretty]                      # combat statistics
 *   ./run src/character.ts --titles [--pretty]                          # titles
 *   ./run src/character.ts --hunter-pets [--pretty]                     # hunter pets
 *   ./run src/character.ts --status [--pretty]                          # character status
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";
import { normalizeClass, normalizeSpec } from "./lib/class-meta.ts";
import {
  resolveCharacter,
  listCharacters,
  getActiveCharacter,
  saveCharacter,
  setActiveCharacter,
} from "./lib/character.ts";

const pretty = hasFlag("--pretty");

try {
  // --- Management subcommands ---

  if (hasFlag("--list-saved")) {
    const slugs = await listCharacters();
    const active = await getActiveCharacter();
    output({ characters: slugs, active }, pretty);
    process.exit(0);
  }

  if (hasFlag("--active") && !hasFlag("--set-active")) {
    const active = await getActiveCharacter();
    if (!active) {
      output({ error: "No active character set" }, pretty);
      process.exit(1);
    }
    // Load the YAML to show details
    const { readFile } = await import("node:fs/promises");
    const yaml = await import("js-yaml");
    const content = await readFile(`user/characters/${active}.yaml`, "utf-8");
    const data = yaml.load(content) as Record<string, unknown>;
    output({ slug: active, ...data }, pretty);
    process.exit(0);
  }

  if (hasFlag("--set-active")) {
    const slug = getArg("--set-active");
    if (!slug) {
      output({ error: "--set-active requires a character slug" }, pretty);
      process.exit(1);
    }
    await setActiveCharacter(slug);
    output({ active: slug }, pretty);
    process.exit(0);
  }

  if (hasFlag("--add")) {
    const name = getArg("--name");
    const realm = getArg("--realm");
    if (!name || !realm) {
      output({ error: "--add requires --name and --realm" }, pretty);
      process.exit(1);
    }
    const classArg = getArg("--class");
    const specArg = getArg("--spec");
    const region = getArg("--region");

    const className = classArg ? normalizeClass(classArg) : undefined;
    const specName = specArg ? normalizeSpec(specArg) : undefined;

    const slug = name.toLowerCase();
    await saveCharacter(slug, {
      name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
      realm: realm.toLowerCase(),
      class: className,
      spec: specName,
      region,
    });
    output({ saved: slug, active: true }, pretty);
    process.exit(0);
  }

  // --- API query subcommands ---

  const char = await resolveCharacter();
  const api = new WoWAPI(char.region);
  const realm = char.realm;
  const name = char.name;

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
