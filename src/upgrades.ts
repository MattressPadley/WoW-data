#!/usr/bin/env bun
/**
 * upgrades.ts — Find gear upgrades from current season dungeons
 *
 * Usage:
 *   ./run src/upgrades.ts --realm turalyon --name treepunch [--pretty]
 *   ./run src/upgrades.ts --realm turalyon --name treepunch --slots head,chest,ring [--pretty]
 *   ./run src/upgrades.ts --realm turalyon --name treepunch --min-ilvl 220 [--pretty]
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, requireArg, output } from "./utils.ts";
import { getArmorType, normalizeSpec } from "./lib/class-meta.ts";
import {
  getCurrentSeasonDungeons,
  getDungeonLoot,
  filterLootForClass,
  normalizeSlotInput,
  type LootItem,
} from "./lib/dungeon-loot.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");
  const realm = requireArg("--realm", "realm slug");
  const name = requireArg("--name", "character name");

  // Fetch character data
  const [profile, equipment] = await Promise.all([
    api.getCharacterProfile(realm, name),
    api.getCharacterEquipment(realm, name),
  ]);

  const className = profile.character_class?.name ?? "Unknown";
  const armorType = getArmorType(className);
  const specArg = getArg("--spec");
  const specName = specArg ? normalizeSpec(specArg) : undefined;

  const SKIP_SLOTS = new Set(["Shirt", "Tabard"]);

  // Build current gear map
  const gear: { slot: string; name: string; ilvl: number }[] = (equipment.equipped_items ?? [])
    .filter((item: any) => !SKIP_SLOTS.has(item.slot?.name))
    .map((item: any) => ({
      slot: item.slot?.name,
      name: item.name,
      ilvl: item.level?.value ?? 0,
    }));

  const gearIlvls = gear.filter((g) => g.ilvl > 0).map((g) => g.ilvl);
  const avgIlvl = gearIlvls.length > 0
    ? Math.round(gearIlvls.reduce((a, b) => a + b, 0) / gearIlvls.length)
    : 0;

  // Determine which slots to find upgrades for
  const slotsArg = getArg("--slots");
  let targetSlots: Set<string>;

  if (slotsArg) {
    targetSlots = new Set(slotsArg.split(",").map(normalizeSlotInput));
  } else {
    // Default: all slots below average ilvl
    targetSlots = new Set(
      gear
        .filter((g) => g.ilvl > 0 && g.ilvl < avgIlvl)
        .map((g) => normalizeSlotInput(g.slot)),
    );
  }

  if (targetSlots.size === 0) {
    output({
      character: { name: profile.name, class: className, average_ilvl: avgIlvl },
      message: "No weak slots found — all gear is at or above average ilvl",
      gear: gear.sort((a, b) => a.ilvl - b.ilvl),
    }, pretty);
    process.exit(0);
  }

  // Build ilvl-by-slot map for comparison
  const ilvlBySlot = new Map<string, number>();
  for (const g of gear) {
    const normalized = normalizeSlotInput(g.slot);
    const existing = ilvlBySlot.get(normalized);
    // For dual slots (rings, trinkets), track the lower one
    if (!existing || g.ilvl < existing) {
      ilvlBySlot.set(normalized, g.ilvl);
    }
  }

  // Fetch dungeon loot
  const dungeons = await getCurrentSeasonDungeons(api);

  // Process dungeons sequentially to avoid rate limits
  const allLoot: LootItem[] = [];
  for (const dungeon of dungeons) {
    const bossLoot = await getDungeonLoot(api, dungeon.id);
    const items = await filterLootForClass(api, bossLoot, dungeon.name, armorType, targetSlots, className, specName);
    allLoot.push(...items);
  }

  // Optional min-ilvl filter (remove results user doesn't care about)
  const minIlvlArg = getArg("--min-ilvl");
  // Note: we can't filter by ilvl since journal items don't have ilvl data
  // but we organize by slot for easy reading

  // Organize by slot
  const bySlot = new Map<string, { dungeon: string; boss: string; item: string; item_id: number }[]>();
  for (const item of allLoot) {
    const slot = normalizeSlotInput(item.slot);
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot)!.push({
      dungeon: item.dungeon,
      boss: item.boss,
      item: item.name,
      item_id: item.id,
    });
  }

  // Deduplicate
  for (const [slot, items] of bySlot) {
    const seen = new Set<number>();
    bySlot.set(
      slot,
      items.filter((i) => {
        if (seen.has(i.item_id)) return false;
        seen.add(i.item_id);
        return true;
      }),
    );
  }

  // Build weak slots summary
  const weakGear = gear
    .filter((g) => targetSlots.has(normalizeSlotInput(g.slot)))
    .sort((a, b) => a.ilvl - b.ilvl);

  const upgradesBySlot: Record<string, any> = {};
  for (const [slot, items] of bySlot) {
    upgradesBySlot[slot] = items;
  }

  output({
    character: {
      name: profile.name,
      realm: profile.realm?.name,
      class: className,
      spec: profile.active_spec?.name,
      armor_type: armorType,
      average_ilvl: avgIlvl,
    },
    weak_gear: weakGear,
    upgrades: upgradesBySlot,
  }, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
