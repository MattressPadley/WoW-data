#!/usr/bin/env bun
/**
 * gear-check.ts — Character gear summary with weak slot identification
 *
 * Usage (active character):
 *   ./run src/gear-check.ts [--pretty]
 *
 * Usage (explicit character):
 *   ./run src/gear-check.ts --character treepunch [--pretty]
 *   ./run src/gear-check.ts --realm turalyon --name treepunch [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { hasFlag, output } from "./utils.ts";
import { getArmorType } from "./lib/class-meta.ts";
import { resolveCharacter } from "./lib/character.ts";

const pretty = hasFlag("--pretty");

try {
  const char = await resolveCharacter();
  const api = new WoWAPI(char.region);

  const [profile, equipment] = await Promise.all([
    api.getCharacterProfile(char.realm, char.name),
    api.getCharacterEquipment(char.realm, char.name),
  ]);

  const className = profile.character_class?.name ?? char.class ?? "Unknown";
  const armorType = getArmorType(className);

  const SKIP_SLOTS = new Set(["Shirt", "Tabard"]);

  const gear = (equipment.equipped_items ?? [])
    .filter((item: any) => !SKIP_SLOTS.has(item.slot?.name))
    .map((item: any) => ({
      slot: item.slot?.name,
      name: item.name,
      ilvl: item.level?.value ?? 0,
      quality: item.quality?.name,
    }));

  gear.sort((a: any, b: any) => a.ilvl - b.ilvl);

  const gearIlvls = gear.filter((g: any) => g.ilvl > 0).map((g: any) => g.ilvl);
  const avgIlvl = gearIlvls.length > 0
    ? Math.round(gearIlvls.reduce((a: number, b: number) => a + b, 0) / gearIlvls.length)
    : 0;

  const weakSlots = gear.filter((g: any) => g.ilvl > 0 && g.ilvl < avgIlvl);

  output({
    character: {
      name: profile.name,
      realm: profile.realm?.name,
      level: profile.level,
      class: className,
      spec: profile.active_spec?.name,
      armor_type: armorType,
      average_ilvl: avgIlvl,
      equipped_ilvl: profile.equipped_item_level,
    },
    gear,
    weak_slots: weakSlots,
  }, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
