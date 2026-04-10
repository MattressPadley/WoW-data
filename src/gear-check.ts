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
import { loadSeason } from "./lib/season.ts";

const pretty = hasFlag("--pretty");

const TRACK_ORDER = ["myth", "hero", "champion", "veteran", "adventurer"];

function resolveTrack(
  ilvl: number,
  trackRanks: Record<string, number[]>,
): { track: string; rank: number; max_rank: number } | null {
  // Try exact match against track_ranks, preferring the highest track
  for (const track of TRACK_ORDER) {
    const ranks = trackRanks[track];
    if (!ranks) continue;
    const idx = ranks.indexOf(ilvl);
    if (idx !== -1) return { track, rank: idx + 1, max_rank: ranks.length };
  }
  // Fallback: find the track whose range contains this ilvl
  for (const track of TRACK_ORDER) {
    const ranks = trackRanks[track];
    if (!ranks || ranks.length === 0) continue;
    if (ilvl >= ranks[0] && ilvl <= ranks[ranks.length - 1]) {
      // Find closest rank
      let closest = 0;
      for (let i = 1; i < ranks.length; i++) {
        if (Math.abs(ranks[i] - ilvl) < Math.abs(ranks[closest] - ilvl)) closest = i;
      }
      return { track, rank: closest + 1, max_rank: ranks.length };
    }
  }
  return null;
}

try {
  const char = await resolveCharacter();
  const api = new WoWAPI(char.region);

  const [profile, equipment, season] = await Promise.all([
    api.getCharacterProfile(char.realm, char.name),
    api.getCharacterEquipment(char.realm, char.name),
    loadSeason(),
  ]);

  const className = profile.character_class?.name ?? char.class ?? "Unknown";
  const armorType = getArmorType(className);

  const SKIP_SLOTS = new Set(["Shirt", "Tabard"]);

  const rawItems = (equipment.equipped_items ?? [])
    .filter((item: any) => !SKIP_SLOTS.has(item.slot?.name));

  // Fetch all item icons in parallel
  const iconResults = await Promise.all(
    rawItems.map((item: any) =>
      api.getItemMedia(item.item?.id ?? item.media?.id).then(
        (media: any) => media.assets?.find((a: any) => a.key === "icon")?.value ?? null,
        () => null,
      )
    )
  );

  const gear = rawItems.map((item: any, i: number) => {
    const ilvl = item.level?.value ?? 0;
    const sourceTag = item.name_description?.display_string ?? null;
    const isCrafted = sourceTag ? /craft/i.test(sourceTag) : false;
    const trackInfo = ilvl > 0 && !isCrafted ? resolveTrack(ilvl, season.track_ranks) : null;

    // Build tooltip data from API fields
    const stats = (item.stats ?? [])
      .filter((s: any) => !s.is_negated)
      .map((s: any) => ({
        name: s.type?.name,
        value: s.value,
        is_equip_bonus: s.is_equip_bonus ?? false,
      }));

    const sockets = (item.sockets ?? []).map((s: any) => ({
      type: s.socket_type?.name ?? "Prismatic Socket",
      gem: s.item?.name ?? null,
      display: s.display_string ?? null,
      empty: !s.item,
    }));

    const spells = (item.spells ?? []).map((s: any) => ({
      name: s.spell?.name ?? null,
      description: s.description ?? null,
    }));

    return {
      slot: item.slot?.name,
      name: item.name,
      ilvl,
      quality: item.quality?.name,
      ...(trackInfo ? { track: trackInfo.track, rank: trackInfo.rank, max_rank: trackInfo.max_rank } : {}),
      ...(isCrafted ? { crafted: true } : {}),
      ...(sourceTag ? { source: sourceTag } : {}),
      ...(iconResults[i] ? { icon: iconResults[i] } : {}),
      ...(item.binding ? { binding: item.binding.name } : {}),
      ...(item.armor ? { armor: item.armor.value } : {}),
      ...(item.item_subclass?.name && item.item_subclass.name !== "Miscellaneous"
        ? { armor_type: item.item_subclass.name } : {}),
      ...(stats.length > 0 ? { stats } : {}),
      ...(sockets.length > 0 ? { sockets } : {}),
      ...(spells.length > 0 ? { spells } : {}),
      ...(item.unique_equipped ? { unique: item.unique_equipped } : {}),
      ...(item.limit_category ? { limit_category: item.limit_category } : {}),
      ...(item.description ? { flavor_text: item.description } : {}),
    };
  });

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
