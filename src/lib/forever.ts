/**
 * WoW Forever data loader.
 *
 * Forever is Vanilla content on the retail engine. Its data source map differs
 * from retail: the Blizzard API is dark for the beta, so everything here comes
 * from wago.tools DB2 exports for the Forever build, a vendored offline extract
 * of reused-Vanilla loot tables, and a locally derived (gitignored) extract of
 * wowtbc.gg's datamined dungeon tables (`./forever-wowtbc.ts`).
 *
 * Hard rule: nothing in this file (or anything it imports) may construct
 * `WoWAPI` or touch `src/lib/dungeon-loot.ts` / `src/lib/journal.ts`. The
 * Blizzard namespace form (`static-<region>`) has no Forever variant, so any
 * Encounter Journal call here would fail. Forever loot comes from `forever/loot/`.
 *
 * Never fabricate a drop source or a stat value: anything we cannot derive is
 * reported as explicitly unknown, and every drop source carries its provenance.
 */

import { mkdir } from "node:fs/promises";
import {
  getCachedCsv,
  getColumnEnums,
  indexBy,
  indexByMulti,
  parseCsv,
  resolveBuild,
  type Row,
  type WagoBuild,
  type WagoOptions,
} from "./wago.ts";
import {
  WOWTBC_MISSING,
  WOWTBC_SOURCE,
  ingestWowtbc,
  loadWowtbc,
  sameName,
  CROSSCHECK_STAT_MAP,
  type ForeverGapItem,
  type WowtbcDungeon,
  type WowtbcExtract,
  type WowtbcProvenance,
  type WowtbcUpstreamStats,
} from "./forever-wowtbc.ts";

/** wago's literal product key. The only place "classic" appears — it is Blizzard's API parameter. */
export const FOREVER_PRODUCT = "wow_classic_beta";
/**
 * `wow_classic_beta` mixes branches: it carries MoP-Classic `5.5.0.x` builds
 * alongside Forever `1.60.1.x`. Filtering on this prefix is mandatory.
 */
export const FOREVER_VERSION_PREFIX = "1.60.1.";

export const FOREVER_DIR = "forever";
const CATALOG_DIR = `${FOREVER_DIR}/catalog`;
const ENUM_DIR = `${FOREVER_DIR}/enums`;
const LOOT_DIR = `${FOREVER_DIR}/loot`;

const ITEM_STAT_TYPE_FILE = `${ENUM_DIR}/item-stat-type.json`;
const ITEM_QUALITY_FILE = `${ENUM_DIR}/item-quality.json`;
const INVENTORY_TYPE_FILE = `${ENUM_DIR}/inventory-type.json`;
const ITEM_BONDING_FILE = `${ENUM_DIR}/item-bonding.json`;
const CATALOG_FILE = `${CATALOG_DIR}/items.json`;
/** Slim projection of {@link CATALOG_FILE} for display surfaces — see {@link ForeverItemView}. */
const ITEMS_VIEW_FILE = `${CATALOG_DIR}/items-view.json`;
const LOOT_FILE = `${LOOT_DIR}/dungeon-loot.json`;

export const FOREVER_TABLES = [
  "ItemSparse",
  "Item",
  "ItemEffect",
  "ItemXItemEffect",
  "SpellName",
  // `Spell` is the text-only companion to `SpellName` — it carries effect descriptions.
  "Spell",
  "ItemSet",
  "ItemSetSpell",
  "RandPropPoints",
  "AreaTable",
  "Map",
  // Display: `Item.IconFileDataID` -> icon file name.
  "ManifestInterfaceData",
  // Readable class/subclass names (raw ids read badly, especially for weapons).
  "ItemClass",
  "ItemSubClass",
  // Allowable-class/race bitmask -> names.
  "ChrClasses",
  "ChrRaces",
  // Armor derivation. `ArmorLocation` is the per-InventoryType multiplier —
  // without it every non-chest piece computes at chest values.
  "ItemArmorTotal",
  "ItemArmorQuality",
  "ItemArmorShield",
  "ArmorLocation",
  // Weapon damage curves. The caster/wand/thrown curves are separate tables;
  // forcing those weapons through the physical curve yields silently wrong DPS.
  "ItemDamageOneHand",
  "ItemDamageTwoHand",
  "ItemDamageRanged",
  "ItemDamageOneHandCaster",
  "ItemDamageTwoHandCaster",
  "ItemDamageWand",
  "ItemDamageThrown",
] as const;

export async function resolveForeverBuild(noCache: boolean): Promise<WagoBuild> {
  return resolveBuild(FOREVER_PRODUCT, FOREVER_VERSION_PREFIX, noCache);
}

export function foreverOptions(build: string): WagoOptions {
  return { product: FOREVER_PRODUCT, build };
}

// --- Enum snapshots -------------------------------------------------------
//
// Enum names are never hardcoded from memory. They are snapshotted from wago's
// DBD metadata (`dbdMeta.enums` on the table browse page) into `forever/enums/`,
// with the build they came from recorded, and refreshed with `--refresh-enums`.

export interface EnumSnapshot {
  enum: string;
  table: string;
  column: string;
  source: string;
  build: string;
  captured_at: string;
  values: Record<string, string>;
}

const ENUM_SOURCES: Record<string, { file: string; table: string; column: string }> = {
  ItemStatType: { file: ITEM_STAT_TYPE_FILE, table: "ItemSparse", column: "StatModifier_bonusStat[0]" },
  ItemQuality: { file: ITEM_QUALITY_FILE, table: "ItemSparse", column: "OverallQualityID" },
  InventoryType: { file: INVENTORY_TYPE_FILE, table: "ItemSparse", column: "InventoryType" },
  ItemBonding: { file: ITEM_BONDING_FILE, table: "ItemSparse", column: "Bonding" },
};

export async function refreshEnumSnapshots(build: string, noCache: boolean): Promise<EnumSnapshot[]> {
  const opts = foreverOptions(build);
  const written: EnumSnapshot[] = [];
  await mkdir(ENUM_DIR, { recursive: true });
  for (const [name, spec] of Object.entries(ENUM_SOURCES)) {
    const enums = await getColumnEnums(spec.table, opts, noCache);
    const match = enums.find((e) => e.column === spec.column && e.name === name);
    if (!match) throw new Error(`wago DBD metadata for ${spec.table}.${spec.column} has no ${name} enum`);
    const values: Record<string, string> = {};
    for (const def of match.definitions) values[def.value] = def.name;
    const snapshot: EnumSnapshot = {
      enum: name,
      table: spec.table,
      column: spec.column,
      source: `https://wago.tools/db2/${spec.table}?build=${build} (props.dbdMeta.enums)`,
      build,
      captured_at: new Date().toISOString(),
      values,
    };
    await Bun.write(spec.file, JSON.stringify(snapshot, null, 2) + "\n");
    written.push(snapshot);
  }
  return written;
}

async function loadEnumSnapshot(name: keyof typeof ENUM_SOURCES | string): Promise<EnumSnapshot> {
  const spec = ENUM_SOURCES[name];
  if (!spec) throw new Error(`Unknown enum ${name}`);
  const file = Bun.file(spec.file);
  if (!(await file.exists())) {
    throw new Error(`Missing enum snapshot ${spec.file} — run: ./run src/forever.ts --refresh-enums`);
  }
  return (await file.json()) as EnumSnapshot;
}

export interface ForeverEnums {
  statType: EnumSnapshot;
  quality: EnumSnapshot;
  inventoryType: EnumSnapshot;
  bonding: EnumSnapshot;
}

export async function loadEnums(): Promise<ForeverEnums> {
  const [statType, quality, inventoryType, bonding] = await Promise.all([
    loadEnumSnapshot("ItemStatType"),
    loadEnumSnapshot("ItemQuality"),
    loadEnumSnapshot("InventoryType"),
    loadEnumSnapshot("ItemBonding"),
  ]);
  return { statType, quality, inventoryType, bonding };
}

// --- Stat budget ----------------------------------------------------------

/**
 * `RandPropPoints` budget column index, by `InventoryType` *enum name*.
 *
 * Slots are grouped by how much of the item budget they carry. Keyed on the
 * snapshotted enum names rather than raw numbers so a future enum reshuffle
 * surfaces as an explicit unknown instead of a silently wrong stat.
 */
const BUDGET_SLOT_GROUPS: string[][] = [
  ["Head", "Chest", "Legs", "Two-Hand"],
  ["Shoulder", "Waist", "Feet", "Hands", "Trinket"],
  ["Neck", "Wrist", "Finger", "Back", "Off Hand", "Held in Off-hand"],
  ["One-Hand", "Main Hand"],
  ["Ranged", "Thrown", "Relic"],
];

const BUDGET_INDEX_BY_SLOT = new Map<string, number>(
  BUDGET_SLOT_GROUPS.flatMap((slots, index) => slots.map((slot) => [slot, index] as [string, number])),
);

/** Which `RandPropPoints` band a quality draws its budget from. */
const BUDGET_BAND_BY_QUALITY: Record<string, "Good" | "Superior" | "Epic"> = {
  Uncommon: "Good",
  Rare: "Superior",
  Heirloom: "Superior",
  Epic: "Epic",
  Legendary: "Epic",
  Artifact: "Epic",
};

export interface StatBudget {
  item_level: number;
  quality: string;
  band: "Good" | "Superior" | "Epic";
  slot: string;
  slot_group: number;
  points: number;
}

export interface ItemStat {
  /** Enum name from the snapshotted `ItemStatType`, or null when the id is not in the enum. */
  stat: string | null;
  stat_id: number;
  /** `StatPercentEditor` — the item's share of the stat budget, in 1/10000ths. */
  allocation: number;
  /** Computed stat value, or null when it could not be derived. */
  value: number | null;
  /** Present only when `value` is null: why it is unknown. Never guessed. */
  unknown?: string;
}

export interface StatContext {
  randPropPoints: Map<string, Row>;
  enums: ForeverEnums;
}

export function resolveStatBudget(
  itemLevel: number,
  qualityId: number,
  inventoryTypeId: number,
  ctx: StatContext,
): { budget: StatBudget } | { budget: null; unknown: string } {
  const quality = ctx.enums.quality.values[String(qualityId)];
  if (!quality) return { budget: null, unknown: `quality id ${qualityId} not in ItemQuality enum` };
  const band = BUDGET_BAND_BY_QUALITY[quality];
  if (!band) return { budget: null, unknown: `${quality} items carry no stat budget` };

  const slot = ctx.enums.inventoryType.values[String(inventoryTypeId)];
  if (!slot) return { budget: null, unknown: `inventory type id ${inventoryTypeId} not in InventoryType enum` };
  const slotGroup = BUDGET_INDEX_BY_SLOT.get(slot);
  if (slotGroup === undefined) return { budget: null, unknown: `slot ${slot} has no stat budget group` };

  const row = ctx.randPropPoints.get(String(itemLevel));
  if (!row) return { budget: null, unknown: `no RandPropPoints row for item level ${itemLevel}` };
  const raw = row[`${band}F_${slotGroup}`];
  if (raw === undefined || raw === "") {
    return { budget: null, unknown: `RandPropPoints ${itemLevel} has no ${band}F_${slotGroup}` };
  }
  const points = Number(raw);
  if (!Number.isFinite(points)) {
    return { budget: null, unknown: `RandPropPoints ${itemLevel} ${band}F_${slotGroup} is not numeric` };
  }
  return { budget: { item_level: itemLevel, quality, band, slot, slot_group: slotGroup, points } };
}

/**
 * Value of one stat allocation against a resolved budget.
 *
 * `value = round(StatPercentEditor * RandPropPoints / 10000)` — the modern
 * engine's item-budget formula, which Forever items use because Forever runs on
 * the retail engine.
 */
export function computeStatValue(allocation: number, points: number): number {
  return Math.floor((allocation * points) / 10000 + 0.5);
}

export function computeItemStats(row: Row, budget: StatBudget | null, budgetUnknown: string | null, enums: ForeverEnums): ItemStat[] {
  const stats: ItemStat[] = [];
  for (let i = 0; i < 10; i++) {
    const rawStat = row[`StatModifier_bonusStat_${i}`];
    const rawAlloc = row[`StatPercentEditor_${i}`];
    if (rawStat === undefined || rawStat === "" || rawStat === "-1") continue;
    const statId = Number(rawStat);
    const allocation = Number(rawAlloc ?? "0");
    if (!Number.isFinite(statId) || !Number.isFinite(allocation) || allocation === 0) continue;
    const name = enums.statType.values[String(statId)] ?? null;
    if (budget) {
      stats.push({ stat: name, stat_id: statId, allocation, value: computeStatValue(allocation, budget.points) });
    } else {
      stats.push({
        stat: name,
        stat_id: statId,
        allocation,
        value: null,
        unknown: budgetUnknown ?? "stat budget could not be resolved",
      });
    }
  }
  return stats;
}

// --- Display enrichment ---------------------------------------------------

/**
 * `Item.IconFileDataID` → the icon's base file name, lowercased, extension
 * stripped (e.g. `inv_helmet_23`).
 *
 * The *name* is stored, never a URL: the catalog stays CDN-agnostic and the
 * consumer decides where icon art comes from. `null` when the id is not in
 * `ManifestInterfaceData`.
 */
export function resolveIconName(iconFileDataId: number, manifest: Map<string, Row>): string | null {
  if (!iconFileDataId) return null;
  const fileName = manifest.get(String(iconFileDataId))?.["FileName"];
  if (!fileName) return null;
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

/**
 * Spell description `$`-token placeholders, stripped rather than substituted.
 *
 * `Spell.Description_lang` is a template: `$s1`/`$o2` are effect values, `$d`
 * a duration, `$t1` a tick period, `$?…[…][…]` a conditional. Resolving them
 * needs `SpellEffect`/`SpellDuration` data this path does not ingest, so the
 * tokens come out and the surrounding prose stays. Inventing a number in their
 * place would be worse than saying less.
 */
export function stripSpellTokens(description: string): string {
  // `${ … }` maths blocks nest (`${$*$<frostdamage>}`), so peel innermost-first.
  let text = description;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/\$\{[^{}]*\}/g, "");
  } while (text !== previous);

  return (
    text
      // Cross-spell references: `$@spelldesc434`.
      .replace(/\$@\w+/g, "")
      // Conditionals: `$?cond[then][else]` — drop the whole construct.
      .replace(/\$\?[^[]*\[[^\]]*\](\[[^\]]*\])?/g, "")
      // Pluralisers / gendered forms: `$lsecond:seconds;`, `$ghe:she;`.
      .replace(/\$[lg][^;]*;/gi, "")
      // Named variables: `$<frostdamage>`.
      .replace(/\$<[^>]*>/g, "")
      // Value, duration, tick and name tokens: `$s1`, `$o2`, `$d`, `$t1`, `$n`,
      // and the cross-spell `$123s1` / `$/1000;s1` forms.
      .replace(/\$(\/\d+;)?\d*[a-z]+\d*/gi, "")
      // A `%` stranded by the number it qualified ("by $s1%" -> "by %").
      .replace(/(^|[\s(])%/gm, "$1")
      // Tidy the holes the tokens left behind, without eating line breaks.
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+$/gm, "")
      .trim()
  );
}

/** Names for the set bits of `AllowableClass` / `AllowableRace`. `null` = no restriction. */
export function decodeAllowMask(mask: bigint, namesById: Map<number, string>): string[] | null {
  // -1 (all bits) and 0 both mean "everyone" in ItemSparse.
  if (mask <= 0n) return null;
  const out: string[] = [];
  for (const [id, name] of namesById) {
    if (id >= 1 && (mask & (1n << BigInt(id - 1))) !== 0n) out.push(name);
  }
  return out.length > 0 && out.length < namesById.size ? out : null;
}

// --- Armor ----------------------------------------------------------------

/**
 * `ArmorLocation`'s per-material column, keyed by the matching `ItemArmorTotal`
 * column. The two tables name the mail material differently (`Mail` vs
 * `Chain`); every other name is shared, so this map is the only place that
 * difference is recorded. Both key sets come from the DB2 headers, not memory.
 */
const ARMOR_LOCATION_COLUMN: Record<string, string> = {
  Cloth: "Clothmodifier",
  Leather: "Leathermodifier",
  Mail: "Chainmodifier",
  Plate: "Platemodifier",
};

/** `ItemSubClass.DisplayName_lang` for the armor subclass that uses `ItemArmorShield`. */
const SHIELD_SUBCLASS = "Shield";

export interface ArmorContext {
  /** `ItemArmorTotal` by item level — per-material base armor. */
  armorTotal: Map<string, Row>;
  /** `ItemArmorQuality` by item level (its `ID` *is* the item level) — quality multiplier. */
  armorQuality: Map<string, Row>;
  /** `ItemArmorShield` by item level — shields bypass the total/location maths entirely. */
  armorShield: Map<string, Row>;
  /** `ArmorLocation` by `InventoryType` — the per-slot multiplier. */
  armorLocation: Map<string, Row>;
  enums: ForeverEnums;
}

function numeric(row: Row | undefined, key: string): number | null {
  const raw = row?.[key];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The `ArmorLocation` row for an inventory type.
 *
 * `InventoryType` has synonym ids that share one enum *name* — 20 ("Chest", the
 * robe variant) alongside 5, 22 alongside 14 ("Off Hand"). Only the canonical id
 * carries multipliers; the synonym's row is all-zero. Falling back to the
 * lowest id with the same snapshotted name keeps robes from computing as 0
 * armor, and the equivalence comes from the enum snapshot rather than a guess.
 */
function armorLocationRow(inventoryTypeId: number, ctx: ArmorContext): Row | undefined {
  const direct = ctx.armorLocation.get(String(inventoryTypeId));
  const isLive = (row: Row | undefined) =>
    row !== undefined && Object.values(ARMOR_LOCATION_COLUMN).some((c) => (numeric(row, c) ?? 0) > 0);
  if (isLive(direct)) return direct;

  const name = ctx.enums.inventoryType.values[String(inventoryTypeId)];
  if (!name) return direct;
  for (const [id, other] of Object.entries(ctx.enums.inventoryType.values)) {
    if (other !== name || Number(id) === inventoryTypeId) continue;
    const row = ctx.armorLocation.get(id);
    if (isLive(row)) return row;
  }
  return direct;
}

export type ArmorResult = { armor: number } | { armor: null; unknown?: string };

/**
 * Armor value for an item, derived from the engine's armor curves.
 *
 * ```
 * shield     armor = ItemArmorShield[ilvl].Quality_<quality>
 * otherwise  armor = round( ItemArmorTotal[ilvl].<material>
 *                          × ItemArmorQuality[ilvl].Qualitymod_<quality>
 *                          × ArmorLocation[inventoryType].<material>modifier )
 * ```
 *
 * The material is the item's own `ItemSubClass.DisplayName_lang`, matched
 * against `ItemArmorTotal`'s column headers — an armor subclass with no such
 * column (Miscellaneous, Libram, Idol, Totem, Cosmetic) carries no armor at all
 * and returns `null` with no `unknown`, which is different from "we could not
 * work it out".
 */
export function computeArmor(
  itemClassName: string | null,
  subclassName: string | null,
  itemLevel: number,
  qualityId: number,
  inventoryTypeId: number,
  ctx: ArmorContext,
): ArmorResult {
  if (itemClassName !== ARMOR_CLASS_NAME) return { armor: null };

  if (subclassName === SHIELD_SUBCLASS) {
    const row = ctx.armorShield.get(String(itemLevel));
    const value = numeric(row, `Quality_${qualityId}`);
    if (value === null) {
      return { armor: null, unknown: `ItemArmorShield has no ilvl ${itemLevel} / quality ${qualityId} entry` };
    }
    return { armor: Math.floor(value + 0.5) };
  }

  const locationColumn = subclassName ? ARMOR_LOCATION_COLUMN[subclassName] : undefined;
  // Not an armor-material subclass (rings, necks, trinkets, relics): no armor by design.
  if (!subclassName || !locationColumn) return { armor: null };

  const base = numeric(ctx.armorTotal.get(String(itemLevel)), subclassName);
  if (base === null) return { armor: null, unknown: `ItemArmorTotal has no ilvl ${itemLevel} ${subclassName} entry` };

  const qualityMod = numeric(ctx.armorQuality.get(String(itemLevel)), `Qualitymod_${qualityId}`);
  if (qualityMod === null) {
    return { armor: null, unknown: `ItemArmorQuality has no ilvl ${itemLevel} / quality ${qualityId} entry` };
  }

  const locationMod = numeric(armorLocationRow(inventoryTypeId, ctx), locationColumn);
  if (locationMod === null) {
    return { armor: null, unknown: `ArmorLocation has no ${locationColumn} for inventory type ${inventoryTypeId}` };
  }
  // A genuine zero multiplier means the slot wears no armor (tabard, shirt).
  if (locationMod === 0) return { armor: null };

  return { armor: Math.floor(base * qualityMod * locationMod + 0.5) };
}

// --- Weapon damage --------------------------------------------------------

/** `ItemClass.ClassName_lang` values this module branches on. */
const WEAPON_CLASS_NAME = "Weapon";
const ARMOR_CLASS_NAME = "Armor";

/**
 * `ItemSubClass.DisplayName_lang` values with a dedicated damage curve, and the
 * `ItemDamage*` table each one uses. Checked before the inventory type, because
 * wands and thrown weapons both sit in a `Ranged` inventory slot.
 */
const DAMAGE_CURVE_BY_SUBCLASS: Record<string, string> = {
  Wand: "ItemDamageWand",
  Thrown: "ItemDamageThrown",
};

/** `InventoryType` enum names whose weapons use the ranged curve. */
const RANGED_SLOT_NAME = "Ranged";
/** `InventoryType` enum name for two-handed weapons. */
const TWO_HAND_SLOT_NAME = "Two-Hand";

/**
 * `ItemSparse.Flags[1]` bit marking a weapon that scales off the *caster*
 * damage curves (`ItemDamageOneHandCaster` / `ItemDamageTwoHandCaster`) rather
 * than the physical ones.
 *
 * This is the only discriminator the client has for caster-vs-physical: it is
 * not derivable from subclass or inventory type (a caster dagger and a rogue
 * dagger are both `Dagger`/`One-Hand`). The selected table is recorded on every
 * weapon as `damage_curve` so the choice is inspectable rather than implicit.
 */
const CASTER_WEAPON_FLAG = 0x200;

export interface WeaponContext {
  /** `ItemDamage*` tables by name, each indexed by item level. */
  damageCurves: Map<string, Map<string, Row>>;
  enums: ForeverEnums;
}

export interface ForeverWeapon {
  /** The `ItemDamage*` table this item's numbers came from. */
  damage_curve: string;
  /** Swing time in seconds (`ItemSparse.ItemDelay` / 1000). */
  speed: number;
  min_damage: number;
  max_damage: number;
  /** `(min + max) / 2 / speed`, to one decimal — the same order the client displays. */
  dps: number;
  /**
   * `ItemSparse.DamageType`. Left as a raw id on purpose: this build's wago DBD
   * metadata publishes no `DamageType` enum, and a school name from memory
   * would be exactly the kind of guess this module refuses to make.
   */
  damage_type_id: number;
}

export type WeaponResult = { weapon: ForeverWeapon } | { weapon: null; unknown?: string };

/** Which `ItemDamage*` table an item uses, resolved from subclass, slot and flags. */
export function resolveDamageCurve(
  subclassName: string | null,
  inventoryTypeId: number,
  flags1: number,
  enums: ForeverEnums,
): string | null {
  const bySubclass = subclassName ? DAMAGE_CURVE_BY_SUBCLASS[subclassName] : undefined;
  if (bySubclass) return bySubclass;

  const slot = enums.inventoryType.values[String(inventoryTypeId)];
  if (!slot) return null;
  if (slot === RANGED_SLOT_NAME) return "ItemDamageRanged";

  const caster = (flags1 & CASTER_WEAPON_FLAG) !== 0;
  if (slot === TWO_HAND_SLOT_NAME) return caster ? "ItemDamageTwoHandCaster" : "ItemDamageTwoHand";
  return caster ? "ItemDamageOneHandCaster" : "ItemDamageOneHand";
}

/**
 * Weapon damage range and DPS.
 *
 * ```
 * average = ItemDamage<curve>[ilvl].Quality_<quality> × speed
 * min     = floor(average × (1 − DmgVariance / 2))
 * max     = round(average × (1 + DmgVariance / 2))
 * dps     = (min + max) / 2 / speed
 * ```
 *
 * The floor/round asymmetry and the DPS-from-rounded-bounds order are the
 * client's, verified against Blizzard's own Classic Era item data (see
 * `docs/forever-data.md`).
 */
export function computeWeapon(
  itemClassName: string | null,
  subclassName: string | null,
  row: Row,
  itemLevel: number,
  qualityId: number,
  inventoryTypeId: number,
  ctx: WeaponContext,
): WeaponResult {
  if (itemClassName !== WEAPON_CLASS_NAME) return { weapon: null };

  const delayMs = numeric(row, "ItemDelay");
  if (delayMs === null || delayMs <= 0) return { weapon: null, unknown: "ItemSparse.ItemDelay is missing or zero" };
  const speed = delayMs / 1000;

  const flags1 = numeric(row, "Flags_1") ?? 0;
  const curveName = resolveDamageCurve(subclassName, inventoryTypeId, flags1, ctx.enums);
  if (!curveName) {
    return { weapon: null, unknown: `inventory type id ${inventoryTypeId} not in InventoryType enum` };
  }
  const curve = ctx.damageCurves.get(curveName);
  const dpsBase = numeric(curve?.get(String(itemLevel)), `Quality_${qualityId}`);
  if (dpsBase === null) {
    return { weapon: null, unknown: `${curveName} has no ilvl ${itemLevel} / quality ${qualityId} entry` };
  }

  const variance = numeric(row, "DmgVariance") ?? 0;
  const average = dpsBase * speed;
  const min = Math.floor(average * (1 - variance / 2));
  const max = Math.floor(average * (1 + variance / 2) + 0.5);

  return {
    weapon: {
      damage_curve: curveName,
      speed,
      min_damage: min,
      max_damage: max,
      dps: Math.round(((min + max) / 2 / speed) * 10) / 10,
      damage_type_id: Math.trunc(numeric(row, "DamageType") ?? 0),
    },
  };
}

// --- Item catalog ---------------------------------------------------------

export interface ForeverItemEffect {
  spell_id: number;
  spell_name: string | null;
  /** `Spell.Description_lang` with `$`-token placeholders stripped, never substituted. */
  spell_description: string | null;
  trigger_type: number;
  charges: number;
  cooldown_ms: number;
}

export interface ForeverItem {
  id: number;
  name: string;
  item_level: number;
  required_level: number;
  quality_id: number;
  quality: string | null;
  inventory_type_id: number;
  inventory_type: string | null;
  class_id: number | null;
  subclass_id: number | null;
  /** `ItemClass.ClassName_lang`, e.g. `Weapon`. Null when the class id is unknown. */
  item_class: string | null;
  /** `ItemSubClass.DisplayName_lang`, e.g. `Dagger`. Null when the pair is unknown. */
  item_subclass: string | null;
  /** Icon *file name* (no path, no extension, lowercased). Null when unresolved. */
  icon: string | null;
  bonding: number;
  /** `ItemBonding` enum name for {@link bonding}, e.g. `Bind on Pickup`. */
  binding: string | null;
  /** `ItemSparse.Description_lang` — the yellow flavour line. Null when empty. */
  flavor: string | null;
  /** Class names from `AllowableClass`. Null when the item is unrestricted. */
  allowable_classes: string[] | null;
  /** Race names from `AllowableRace_0/1`. Null when the item is unrestricted. */
  allowable_races: string[] | null;
  /** Derived armor value. Null when the item carries none or it could not be derived. */
  armor: number | null;
  /** Present only when {@link armor} is null *and* we failed to derive it. */
  armor_unknown?: string;
  /** Derived damage range / DPS for weapons. Null for everything else. */
  weapon: ForeverWeapon | null;
  /** Present only when {@link weapon} is null *and* we failed to derive it. */
  weapon_unknown?: string;
  sell_price: number;
  buy_price: number;
  sockets: (string | null)[];
  budget: StatBudget | null;
  stats: ItemStat[];
  effects: ForeverItemEffect[];
  item_set: { id: number; name: string } | null;
}

export interface ForeverItemSet {
  id: number;
  name: string;
  item_ids: number[];
  bonuses: { spell_id: number; spell_name: string | null; threshold: number }[];
}

export interface CatalogMeta {
  product: string;
  build: string;
  build_created_at: string;
  ingested_at: string;
  source: string;
  tables: string[];
  item_count: number;
  item_set_count: number;
  zone_count: number;
  map_count: number;
  items_with_computed_stats: number;
  items_with_icon: number;
  items_with_armor: number;
  items_with_weapon_damage: number;
  stat_type_enum_build: string;
}

export interface ForeverZone {
  area_id: number;
  name: string;
  continent_id: number;
  parent_area_id: number;
}

export interface ForeverMap {
  map_id: number;
  directory: string;
  name: string;
  instance_type: number;
  map_type: number;
  area_id: number;
  max_players: number;
}

export interface ForeverCatalog {
  meta: CatalogMeta;
  items: ForeverItem[];
  item_sets: ForeverItemSet[];
  /** `AreaTable` — zone/subzone names, so vendored loot can be located without the Journal. */
  zones: ForeverZone[];
  /** `Map` — instance maps for the Forever build. */
  maps: ForeverMap[];
}

function num(row: Row | undefined, key: string): number {
  const v = row?.[key];
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Every `ItemDamage*` table {@link resolveDamageCurve} can select. */
const DAMAGE_CURVE_TABLES = FOREVER_TABLES.filter((t) => t.startsWith("ItemDamage"));

export async function ingestCatalog(build: string, noCache: boolean): Promise<ForeverCatalog> {
  const opts = foreverOptions(build);
  const fetchTable = (name: string) => getCachedCsv(name, noCache, opts);
  const [itemSparseText, itemText, itemEffectText, itemXEffectText, spellNameText, spellText, itemSetText, itemSetSpellText, rppText, areaText, mapText] =
    await Promise.all([
      fetchTable("ItemSparse"),
      fetchTable("Item"),
      fetchTable("ItemEffect"),
      fetchTable("ItemXItemEffect"),
      fetchTable("SpellName"),
      fetchTable("Spell"),
      fetchTable("ItemSet"),
      fetchTable("ItemSetSpell"),
      fetchTable("RandPropPoints"),
      fetchTable("AreaTable"),
      fetchTable("Map"),
    ]);
  const [manifestText, itemClassText, itemSubClassText, chrClassesText, chrRacesText, armorTotalText, armorQualityText, armorShieldText, armorLocationText] =
    await Promise.all([
      fetchTable("ManifestInterfaceData"),
      fetchTable("ItemClass"),
      fetchTable("ItemSubClass"),
      fetchTable("ChrClasses"),
      fetchTable("ChrRaces"),
      fetchTable("ItemArmorTotal"),
      fetchTable("ItemArmorQuality"),
      fetchTable("ItemArmorShield"),
      fetchTable("ArmorLocation"),
    ]);
  const damageCurveTexts = await Promise.all(DAMAGE_CURVE_TABLES.map(fetchTable));

  const enums = await loadEnums();
  const sparseRows = parseCsv(itemSparseText);
  const items = indexBy(parseCsv(itemText), "ID");
  const effects = indexBy(parseCsv(itemEffectText), "ID");
  // ItemEffect has no ParentItemID — ItemXItemEffect is the join.
  const effectsByItem = indexByMulti(parseCsv(itemXEffectText), "ItemID");
  // The `Spell` table is text-only; SpellName carries the name.
  const spellNames = indexBy(parseCsv(spellNameText), "ID");
  const spellText_ = indexBy(parseCsv(spellText), "ID");
  const iconManifest = indexBy(parseCsv(manifestText), "ID");
  const classNames = new Map(parseCsv(itemClassText).map((r) => [r["ClassID"] ?? "", r["ClassName_lang"] ?? ""]));
  const subclassNames = new Map(
    parseCsv(itemSubClassText).map((r) => [`${r["ClassID"]}/${r["SubClassID"]}`, r["DisplayName_lang"] ?? ""]),
  );
  const chrClasses = new Map(parseCsv(chrClassesText).map((r) => [num(r, "ID"), r["Name_lang"] ?? ""]));
  const chrRaces = new Map(parseCsv(chrRacesText).map((r) => [num(r, "ID"), r["Name_lang"] ?? ""]));

  const armorCtx: ArmorContext = {
    // `ItemArmorQuality` has no ItemLevel column — its `ID` *is* the item level.
    armorTotal: indexBy(parseCsv(armorTotalText), "ItemLevel"),
    armorQuality: indexBy(parseCsv(armorQualityText), "ID"),
    armorShield: indexBy(parseCsv(armorShieldText), "ItemLevel"),
    // `ArmorLocation.ID` is the `InventoryType` value.
    armorLocation: indexBy(parseCsv(armorLocationText), "ID"),
    enums,
  };
  const weaponCtx: WeaponContext = {
    damageCurves: new Map(
      DAMAGE_CURVE_TABLES.map((name, i) => [name, indexBy(parseCsv(damageCurveTexts[i]!), "ItemLevel")]),
    ),
    enums,
  };

  const setRows = parseCsv(itemSetText);
  const setSpellsBySet = indexByMulti(parseCsv(itemSetSpellText), "ItemSetID");
  const randPropPoints = indexBy(parseCsv(rppText), "ID");

  const zones: ForeverZone[] = parseCsv(areaText).map((row) => ({
    area_id: num(row, "ID"),
    name: row["AreaName_lang"] ?? "",
    continent_id: num(row, "ContinentID"),
    parent_area_id: num(row, "ParentAreaID"),
  }));
  const maps: ForeverMap[] = parseCsv(mapText).map((row) => ({
    map_id: num(row, "ID"),
    directory: row["Directory"] ?? "",
    name: row["MapName_lang"] ?? "",
    instance_type: num(row, "InstanceType"),
    map_type: num(row, "MapType"),
    area_id: num(row, "AreaTableID"),
    max_players: num(row, "MaxPlayers"),
  }));

  const ctx: StatContext = { randPropPoints, enums };

  const spellName = (id: number): string | null => spellNames.get(String(id))?.["Name_lang"] ?? null;

  const itemSets: ForeverItemSet[] = setRows.map((row) => {
    const id = num(row, "ID");
    const itemIds: number[] = [];
    for (let i = 0; i < 17; i++) {
      const itemId = num(row, `ItemID_${i}`);
      if (itemId > 0) itemIds.push(itemId);
    }
    const bonuses = (setSpellsBySet.get(String(id)) ?? []).map((s) => {
      const spellId = num(s, "SpellID");
      return { spell_id: spellId, spell_name: spellName(spellId), threshold: num(s, "Threshold") };
    });
    bonuses.sort((a, b) => a.threshold - b.threshold);
    return { id, name: row["Name_lang"] ?? "", item_ids: itemIds, bonuses };
  });
  const setsById = new Map(itemSets.map((s) => [s.id, s]));

  const catalogItems: ForeverItem[] = [];
  let withStats = 0;
  let withIcon = 0;
  let withArmor = 0;
  let withWeapon = 0;

  for (const row of sparseRows) {
    const id = num(row, "ID");
    const itemRow = items.get(String(id));
    const itemLevel = num(row, "ItemLevel");
    const qualityId = num(row, "OverallQualityID");
    // InventoryType lives on both tables; ItemSparse is authoritative, Item is the fallback.
    const inventoryTypeId = row["InventoryType"] !== undefined && row["InventoryType"] !== ""
      ? num(row, "InventoryType")
      : num(itemRow, "InventoryType");

    const resolved = resolveStatBudget(itemLevel, qualityId, inventoryTypeId, ctx);
    const budget = resolved.budget;
    const budgetUnknown = resolved.budget === null ? resolved.unknown : null;
    const stats = computeItemStats(row, budget, budgetUnknown, enums);
    if (stats.length > 0 && stats.every((s) => s.value !== null)) withStats++;

    const itemEffects: ForeverItemEffect[] = [];
    for (const link of effectsByItem.get(String(id)) ?? []) {
      const effect = effects.get(link["ItemEffectID"] ?? "");
      if (!effect) continue;
      const spellId = num(effect, "SpellID");
      const rawDescription = spellText_.get(String(spellId))?.["Description_lang"] ?? "";
      const description = rawDescription ? stripSpellTokens(rawDescription) : "";
      itemEffects.push({
        spell_id: spellId,
        spell_name: spellName(spellId),
        spell_description: description || null,
        trigger_type: num(effect, "TriggerType"),
        charges: num(effect, "Charges"),
        cooldown_ms: num(effect, "CoolDownMSec"),
      });
    }

    const sockets: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const socket = num(row, `SocketType_${i}`);
      if (socket > 0) sockets.push(String(socket));
    }

    const setId = num(row, "ItemSet");
    const set = setId > 0 ? setsById.get(setId) : undefined;

    const classId = itemRow ? num(itemRow, "ClassID") : null;
    const subclassId = itemRow ? num(itemRow, "SubclassID") : null;
    const itemClass = classId === null ? null : classNames.get(String(classId)) ?? null;
    const itemSubclass = classId === null ? null : subclassNames.get(`${classId}/${subclassId}`) ?? null;

    const icon = itemRow ? resolveIconName(num(itemRow, "IconFileDataID"), iconManifest) : null;
    if (icon) withIcon++;

    const armorResult = computeArmor(itemClass, itemSubclass, itemLevel, qualityId, inventoryTypeId, armorCtx);
    if (armorResult.armor !== null) withArmor++;
    const weaponResult = computeWeapon(itemClass, itemSubclass, row, itemLevel, qualityId, inventoryTypeId, weaponCtx);
    if (weaponResult.weapon !== null) withWeapon++;

    // `AllowableRace` is a 64-bit mask split across two 32-bit columns.
    const raceMask =
      (BigInt.asUintN(32, BigInt(num(row, "AllowableRace_1"))) << 32n) |
      BigInt.asUintN(32, BigInt(num(row, "AllowableRace_0")));
    const classMask = BigInt.asUintN(32, BigInt(num(row, "AllowableClass")));
    const unrestrictedRace = num(row, "AllowableRace_0") === -1 || num(row, "AllowableRace_0") === 0;

    const bondingId = num(row, "Bonding");
    const flavor = row["Description_lang"] ?? "";

    catalogItems.push({
      id,
      name: row["Display_lang"] ?? "",
      item_level: itemLevel,
      required_level: num(row, "RequiredLevel"),
      quality_id: qualityId,
      quality: enums.quality.values[String(qualityId)] ?? null,
      inventory_type_id: inventoryTypeId,
      inventory_type: enums.inventoryType.values[String(inventoryTypeId)] ?? null,
      class_id: classId,
      subclass_id: subclassId,
      item_class: itemClass,
      item_subclass: itemSubclass,
      icon,
      bonding: bondingId,
      binding: enums.bonding.values[String(bondingId)] ?? null,
      flavor: flavor || null,
      allowable_classes: num(row, "AllowableClass") === -1 ? null : decodeAllowMask(classMask, chrClasses),
      allowable_races: unrestrictedRace ? null : decodeAllowMask(raceMask, chrRaces),
      armor: armorResult.armor,
      ...("unknown" in armorResult && armorResult.unknown ? { armor_unknown: armorResult.unknown } : {}),
      weapon: weaponResult.weapon,
      ...("unknown" in weaponResult && weaponResult.unknown ? { weapon_unknown: weaponResult.unknown } : {}),
      sell_price: num(row, "SellPrice"),
      buy_price: num(row, "BuyPrice"),
      sockets,
      budget,
      stats,
      effects: itemEffects,
      item_set: set ? { id: set.id, name: set.name } : null,
    });
  }

  catalogItems.sort((a, b) => a.id - b.id);

  const buildInfo = (await resolveForeverBuild(noCache));
  const catalog: ForeverCatalog = {
    meta: {
      product: FOREVER_PRODUCT,
      build,
      build_created_at: buildInfo.version === build ? buildInfo.created_at : "",
      ingested_at: new Date().toISOString(),
      source: "https://wago.tools DB2 CSV exports",
      tables: [...FOREVER_TABLES],
      item_count: catalogItems.length,
      item_set_count: itemSets.length,
      zone_count: zones.length,
      map_count: maps.length,
      items_with_computed_stats: withStats,
      items_with_icon: withIcon,
      items_with_armor: withArmor,
      items_with_weapon_damage: withWeapon,
      stat_type_enum_build: enums.statType.build,
    },
    items: catalogItems,
    item_sets: itemSets,
    zones,
    maps,
  };

  await mkdir(CATALOG_DIR, { recursive: true });
  await Bun.write(CATALOG_FILE, JSON.stringify(catalog));
  const [wowtbc, loot] = await Promise.all([loadWowtbc(), loadDungeonLootIfPresent()]);
  await Bun.write(ITEMS_VIEW_FILE, JSON.stringify(projectItemsView(catalog, wowtbc, loot)));
  return catalog;
}

/**
 * Ingest the wowtbc.gg dungeon tables against the ingested catalog, then
 * rewrite the items view so it carries the gap items and provenance-stamped
 * drop sources.
 */
export async function ingestWowtbcTables(build: string, noCache: boolean): Promise<WowtbcExtract> {
  const [catalog, enums] = await Promise.all([loadCatalog(), loadEnums()]);
  if (catalog.meta.build !== build) {
    throw new Error(`Catalog is build ${catalog.meta.build}, not ${build} — run --ingest --build ${build} first`);
  }
  const extract = await ingestWowtbc(
    {
      build,
      sparseIds: new Set(catalog.items.map((i) => i.id)),
      qualities: enums.quality.values,
      bondings: enums.bonding.values,
      inventoryTypes: enums.inventoryType.values,
      itemSets: catalog.item_sets,
    },
    noCache,
    FOREVER_PRODUCT,
  );
  await Bun.write(ITEMS_VIEW_FILE, JSON.stringify(projectItemsView(catalog, extract, await loadDungeonLootIfPresent())));
  return extract;
}

export async function loadCatalog(): Promise<ForeverCatalog> {
  const file = Bun.file(CATALOG_FILE);
  if (!(await file.exists())) {
    throw new Error(`No Forever catalog at ${CATALOG_FILE} — run: ./run src/forever.ts --ingest`);
  }
  return (await file.json()) as ForeverCatalog;
}

// --- Projected view -------------------------------------------------------

/**
 * One row of `forever/catalog/items-view.json` — the slim projection display
 * surfaces read instead of the full catalog.
 *
 * Everything a human never sees is dropped: stat budgets and allocations,
 * numeric stat/quality/inventory-type ids, prices, and empty socket lists. What
 * stays is exactly what the item table and its tooltip render. Fields are
 * *omitted* rather than emitted as `null` — at 19k items the repeated key names
 * alone cost ~4MB — so every field below is optional to the reader. Unknown
 * *reasons* survive the projection: an omitted armor value has to keep saying
 * why it is missing.
 */
export interface ForeverItemView {
  id: number;
  name: string;
  /** Icon file name, no path or extension. The consumer composes the URL. */
  icon?: string;
  /** Always a number for build rows; null only on a gap item whose upstream row gives none. */
  item_level: number | null;
  required_level: number | null;
  quality?: string;
  inventory_type?: string;
  item_class?: string;
  item_subclass?: string;
  binding?: string;
  flavor?: string;
  allowable_classes?: string[];
  allowable_races?: string[];
  armor?: number;
  armor_unknown?: string;
  weapon?: ForeverWeapon;
  weapon_unknown?: string;
  stats?: { stat: string | null; value: number | null; unknown?: string }[];
  effects?: {
    spell_name: string | null;
    spell_description: string | null;
    trigger_type: number;
    cooldown_ms: number;
  }[];
  item_set?: { id: number; name: string };
  sockets?: (string | null)[];
  /**
   * Where the row's non-drop data came from. Absent = the build (`ItemSparse`).
   * `wowtbc-warcraftforever` = a gap item: the build has no `ItemSparse` row, so
   * name/ilvl/quality are datamined — see {@link ForeverGapItem.field_sources}.
   */
  data_source?: typeof WOWTBC_SOURCE;
  /** Gap items only: upstream's stat blocks, raw. Never build-computed — {@link stats} stays absent. */
  upstream_stats?: WowtbcUpstreamStats;
  /** Gap items only: upstream's `discovered` flag (true / false / null). */
  discovered?: boolean | null;
  /** Drop/quest sources, each carrying its provenance. Absent = no source known. */
  drop_sources?: ForeverViewDropSource[];
}

export interface ForeverViewDropSource {
  /** wowtbc dungeon slug. The join key for the instance index — names differ between sources, keys do not. */
  dungeon_key: string;
  dungeon: string;
  kind: "boss" | "trash" | "quest";
  /** Boss or quest name; absent for trash. */
  name?: string;
  source: typeof WOWTBC_SOURCE;
  /** Upstream's `discovered` flag for the item, tri-state: `null` = upstream did not say. */
  discovered: boolean | null;
  /** When the dungeon page this source came from was fetched. */
  fetched_at: string;
}

export interface ForeverItemsView {
  meta: {
    build: string;
    ingested_at: string;
    item_count: number;
    /** How many rows are wowtbc gap items rather than build rows. */
    gap_item_count: number;
    /** When the wowtbc extract was fetched; null when none is ingested. */
    wowtbc_fetched_at: string | null;
    /** Restated on the view so a consumer never reads an absent `drop_sources` as "drops from nothing". */
    drop_sources_unknown: string;
    /** Every instance either loot source lists, including ones whose loot is unknown. See {@link instanceIndex}. */
    instances: ForeverInstanceIndexEntry[];
    /** Set when no wowtbc extract is ingested: nothing in the index resolves to items. */
    wowtbc_missing?: string;
    /** Set when the vendored AtlasLoot extract is missing: the index lists wowtbc dungeons only. */
    atlasloot_missing?: string;
  };
  items: ForeverItemView[];
}

/**
 * Drop sources are shown only with provenance.
 *
 * They are server-side and absent from the client. The view carries one only
 * when a stamped source supplies it (today: the wowtbc datamined tables), and
 * an item with none carries no field at all plus this sentence — never an
 * empty list that reads as "drops from nothing".
 */
export const DROP_SOURCES_UNKNOWN =
  "drop sources are server-side and absent from the client; one is shown only with its provenance (the datamined wowtbc.gg tables), and an item without one has no known source — see `--item-sources <id>`";

/** Spread helper: emit `{ key: value }` only when `value` is set and non-empty. */
function present<K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value) && value.length === 0) return {};
  return { [key]: value } as Partial<Record<K, V>>;
}

function viewDropSources(wowtbc: WowtbcExtract | null, id: number): ForeverViewDropSource[] | null {
  const sources = wowtbc?.items[String(id)]?.sources;
  if (!sources || sources.length === 0) return null;
  const item = wowtbc!.items[String(id)]!;
  return sources.map((s) => ({
    dungeon_key: s.dungeon_key,
    dungeon: s.dungeon,
    kind: s.kind,
    ...present("name", s.name),
    source: WOWTBC_SOURCE,
    discovered: item.provenance.discovered,
    // Per source, not per item: an item listed in two dungeons came from two pages.
    fetched_at: wowtbc!.dungeons[s.dungeon_key]?.fetched_at ?? item.provenance.fetched_at,
  }));
}

function projectGapItem(gap: ForeverGapItem, wowtbc: WowtbcExtract): ForeverItemView {
  return {
    id: gap.id,
    name: gap.name,
    // Unknown upstream stays null — a 0 would read as a real value.
    item_level: gap.item_level,
    required_level: gap.required_level,
    ...present("icon", gap.icon),
    ...present("quality", gap.quality),
    ...present("inventory_type", gap.inventory_type),
    ...present("item_class", gap.item_class),
    ...present("item_subclass", gap.item_subclass),
    ...present("binding", gap.binding),
    ...present("item_set", gap.item_set),
    data_source: WOWTBC_SOURCE,
    ...present("upstream_stats", Object.keys(gap.upstream_stats).length > 0 ? gap.upstream_stats : null),
    discovered: gap.provenance.discovered,
    ...present("drop_sources", viewDropSources(wowtbc, gap.id)),
  };
}

/**
 * Project the catalog into the display view. `loot` is optional so a missing
 * vendored extract degrades the instance index rather than failing ingest.
 */
export function projectItemsView(
  catalog: ForeverCatalog,
  wowtbc: WowtbcExtract | null = null,
  loot: LootExtract | null = null,
): ForeverItemsView {
  // Re-checked here: a newer build may since have shipped an `ItemSparse` row, and then the build wins.
  const buildIds = new Set(catalog.items.map((i) => i.id));
  const gapItems = wowtbc ? Object.values(wowtbc.gap_items).filter((g) => !buildIds.has(g.id)) : [];
  const items: ForeverItemView[] = catalog.items.map((item) => ({
      id: item.id,
      name: item.name,
      item_level: item.item_level,
      required_level: item.required_level,
      ...present("icon", item.icon),
      ...present("quality", item.quality),
      ...present("inventory_type", item.inventory_type),
      ...present("item_class", item.item_class),
      ...present("item_subclass", item.item_subclass),
      // A "Not Bound" item shows no binding line at all, so it carries no value here.
      ...present("binding", item.bonding > 0 ? item.binding : null),
      ...present("flavor", item.flavor),
      ...present("allowable_classes", item.allowable_classes),
      ...present("allowable_races", item.allowable_races),
      ...present("armor", item.armor),
      ...present("armor_unknown", item.armor_unknown),
      ...present("weapon", item.weapon),
      ...present("weapon_unknown", item.weapon_unknown),
      ...present(
        "stats",
        item.stats.map((s) => ({ stat: s.stat, value: s.value, ...present("unknown", s.unknown) })),
      ),
      ...present(
        "effects",
        item.effects.map((e) => ({
          spell_name: e.spell_name,
          spell_description: e.spell_description,
          trigger_type: e.trigger_type,
          cooldown_ms: e.cooldown_ms,
        })),
      ),
      ...present("item_set", item.item_set),
      ...present("sockets", item.sockets),
      ...present("drop_sources", viewDropSources(wowtbc, item.id)),
    }));
  if (wowtbc) items.push(...gapItems.map((g) => projectGapItem(g, wowtbc)));
  items.sort((a, b) => a.id - b.id);
  return {
    meta: {
      build: catalog.meta.build,
      ingested_at: catalog.meta.ingested_at,
      item_count: items.length,
      gap_item_count: gapItems.length,
      wowtbc_fetched_at: wowtbc?.meta.fetched_at ?? null,
      drop_sources_unknown: DROP_SOURCES_UNKNOWN,
      instances: instanceIndex(loot, wowtbc),
      ...present("wowtbc_missing", wowtbc ? null : WOWTBC_MISSING),
      ...present("atlasloot_missing", loot ? null : ATLASLOOT_MISSING),
    },
    items,
  };
}

export async function loadItemsView(): Promise<ForeverItemsView> {
  const file = Bun.file(ITEMS_VIEW_FILE);
  if (!(await file.exists())) {
    throw new Error(`No Forever item view at ${ITEMS_VIEW_FILE} — run: bun run src/forever.ts --ingest`);
  }
  return (await file.json()) as ForeverItemsView;
}

// --- Vendored loot --------------------------------------------------------

/** How much we trust a boss's loot list. Forever-new content is never asserted as known. */
export type LootStatus = "known-vanilla" | "unknown-new-content";

export interface LootEntry {
  /** Display order upstream used; null when upstream had none. */
  slot: number | null;
  item_id: number;
  /** `vanilla` rows are reused live-Vanilla data; `forever-new` rows are unverified. */
  provenance: "vanilla" | "forever-new";
}

export interface LootBoss {
  name: string;
  npc_id: number | null;
  loot_status: LootStatus;
  atlas_map_boss_id: number | null;
  difficulties: Record<string, LootEntry[]>;
  /** Upstream's Vanilla-observed drop percentages by item id, when it has the NPC. */
  drop_rates: Record<string, number> | null;
  /** Non-empty when something about this boss is not known. Never inferred away. */
  unknown: string[];
}

export interface LootInstance {
  key: string;
  name: string;
  /** `AreaTable` name for `map_id` in the Forever build; null when it did not resolve. */
  area_name: string | null;
  content_type: string | null;
  map_id: number | null;
  instance_id: number | null;
  level_range: number[] | null;
  /** `vanilla` = instance exists in live Vanilla; `forever-new` = added by Forever. */
  provenance: "vanilla" | "forever-new";
  bosses: LootBoss[];
  unknown: string[];
}

export interface LootExtract {
  meta: {
    generated_at: string;
    generator: string;
    upstream: { repo: string; commit: string; paths: string[]; license: string };
    instance_count: number;
    boss_count: number;
    known_vanilla_boss_count: number;
    unknown_new_content_boss_count: number;
    notes: string[];
  };
  instances: LootInstance[];
}

export async function loadDungeonLoot(): Promise<LootExtract> {
  const file = Bun.file(LOOT_FILE);
  if (!(await file.exists())) {
    throw new Error(
      `No vendored Forever loot at ${LOOT_FILE} — regenerate with: bun run scripts/extract-atlasloot.ts`,
    );
  }
  return (await file.json()) as LootExtract;
}

/**
 * The vendored extract, or null when the file is missing. For the view
 * projection only: it degrades the instance index rather than failing ingest.
 * A present-but-corrupt file still throws.
 */
export async function loadDungeonLootIfPresent(): Promise<LootExtract | null> {
  const file = Bun.file(LOOT_FILE);
  return (await file.exists()) ? ((await file.json()) as LootExtract) : null;
}

export const ATLASLOOT_MISSING = `no vendored AtlasLoot extract at ${LOOT_FILE} — regenerate with: bun run scripts/extract-atlasloot.ts`;

// --- Instance merge and index ---------------------------------------------

/** One instance as the two loot sources see it. At least one side is set. */
export interface MergedInstance {
  atlasloot: LootInstance | null;
  wowtbc: WowtbcDungeon | null;
}

/**
 * Pair AtlasLoot instances with wowtbc dungeons: AtlasLoot order first, then
 * the dungeons only wowtbc lists. The two name things differently ("The Hall
 * of Thanes" vs "Hall of Thanes"), so pairing is loose — which is exactly why
 * anything joining against item drop sources must use the wowtbc key, never a
 * display name.
 */
export function mergeInstances(loot: LootExtract | null, wowtbc: WowtbcExtract | null): MergedInstance[] {
  const dungeons = Object.values(wowtbc?.dungeons ?? {});
  const match = (name: string, key: string) =>
    dungeons.find((d) => sameName(d.name, name) || sameName(d.key, key) || sameName(d.name, key));
  const seen = new Set<string>();
  const paired = (loot?.instances ?? []).map((i) => {
    const w = match(i.name, i.key) ?? null;
    if (w) seen.add(w.key);
    return { atlasloot: i, wowtbc: w };
  });
  const wowtbcOnly = dungeons.filter((d) => !seen.has(d.key)).map((d) => ({ atlasloot: null, wowtbc: d }));
  return [...paired, ...wowtbcOnly];
}

export type ForeverInstanceStatus = "listed" | "unknown";

/**
 * A boss in the instance index.
 *
 * wowtbc's `status` is per *dungeon*, so a boss's status is defined here:
 * `listed` = wowtbc's table for a listed dungeon names this boss, so its items
 * resolve through the rows' `drop_sources`; `unknown` = no item can resolve to
 * it in this view (AtlasLoot-only boss, raid boss, unknown dungeon, or no wowtbc
 * extract), with the reason in `unknown`.
 */
export interface ForeverInstanceBoss {
  /** wowtbc's name when wowtbc lists the boss (it must match `drop_sources[].name`); else AtlasLoot's. */
  name: string;
  status: ForeverInstanceStatus;
  unknown?: string;
}

export interface ForeverInstanceIndexEntry {
  /** wowtbc dungeon slug — the join key against `drop_sources[].dungeon_key`. AtlasLoot's key only when wowtbc lacks the instance. */
  key: string;
  /** Display name: AtlasLoot's where both list the instance (matches `--list-instances`), else wowtbc's. */
  name: string;
  kind: "dungeon" | "raid";
  is_new: boolean;
  /** `unknown` = no item in this view resolves to the instance. Never read as "drops nothing". */
  status: ForeverInstanceStatus;
  unknown: string[];
  bosses: ForeverInstanceBoss[];
  /** wowtbc lists trash drops for the dungeon. */
  has_trash: boolean;
  /** wowtbc quest names, deduplicated. */
  quests: string[];
  /** Which sources list the instance, each stamped. Both are datamined, neither observed. */
  sources: { source: string; fetched_at?: string; upstream_commit?: string }[];
}

const UNRESOLVED_INSTANCE =
  "not in wowtbc's dungeon tables — item → boss resolution in this view uses those tables only (v1: dungeons; raids deferred)";
const UNRESOLVED_BOSS =
  "only in the AtlasLoot extract — wowtbc's table for this dungeon does not name it, so no item resolves to it in this view";

/**
 * AtlasLoot mixes loot groupings in with encounters ("Trash", "Trash Mobs",
 * "Keys", "Books", "Plans", "Tier 3 Sets", "All bosses"). Those — and only
 * those — carry neither an npc id nor an Atlas map boss id; every encounter has
 * at least one. Trash stays a facet value of its own, never a boss.
 */
function isAtlasEncounter(boss: LootBoss): boolean {
  return boss.npc_id !== null || boss.atlas_map_boss_id !== null;
}

/**
 * The instance/boss index the item browser's facet lists.
 *
 * It lists every instance either source knows — including empty and raid ones —
 * so the facet can show them as unknown instead of hiding them. It carries no
 * item ids: the item → boss mapping is already on the view rows
 * (`drop_sources[]`), joined on `key` + boss name.
 */
export function instanceIndex(loot: LootExtract | null, wowtbc: WowtbcExtract | null): ForeverInstanceIndexEntry[] {
  return mergeInstances(loot, wowtbc).map(({ atlasloot: a, wowtbc: w }) => {
    const resolvable = w !== null && w.status === "listed";
    const instanceUnknown = !wowtbc ? WOWTBC_MISSING : !w ? UNRESOLVED_INSTANCE : (w.unknown[0] ?? UNRESOLVED_INSTANCE);
    const bosses: ForeverInstanceBoss[] = [];
    const wowtbcBosses = Object.keys(w?.bosses ?? {});
    const claimed = new Set<string>();
    for (const boss of (a?.bosses ?? []).filter(isAtlasEncounter)) {
      const hit = resolvable ? wowtbcBosses.find((b) => !claimed.has(b) && sameName(b, boss.name)) : undefined;
      if (hit) {
        claimed.add(hit);
        bosses.push({ name: hit, status: "listed" });
      } else {
        bosses.push({ name: boss.name, status: "unknown", unknown: resolvable ? UNRESOLVED_BOSS : instanceUnknown });
      }
    }
    for (const name of wowtbcBosses) if (!claimed.has(name)) bosses.push({ name, status: "listed" });
    const kind = a?.content_type && /raid/i.test(a.content_type) ? "raid" : "dungeon";
    return {
      key: w?.key ?? a!.key,
      name: a?.name ?? w!.name,
      kind,
      is_new: w?.is_new ?? a?.provenance === "forever-new",
      status: resolvable ? "listed" : "unknown",
      unknown: resolvable ? [] : [instanceUnknown],
      bosses,
      has_trash: resolvable && (w.trash?.item_ids.length ?? 0) > 0,
      quests: resolvable ? [...new Set(w.quests.map((q) => q.name))] : [],
      sources: [
        ...(a ? [{ source: ATLASLOOT_SOURCE, upstream_commit: loot!.meta.upstream.commit }] : []),
        ...(w ? [{ source: WOWTBC_SOURCE, fetched_at: w.fetched_at }] : []),
      ],
    };
  });
}

/** `source` label for rows from the vendored AtlasLootClassic extract. */
export const ATLASLOOT_SOURCE = "atlaslootclassic-extract";

export interface NamedLootEntry extends LootEntry {
  /** Resolved from the ingested catalog, else a wowtbc gap item; null when neither has it. */
  name: string | null;
  item_level: number | null;
  quality: string | null;
  /** Set when the name came from wowtbc's datamined tables rather than the build. */
  data_source?: typeof WOWTBC_SOURCE;
  /** Present when the item id resolves nowhere. Never guessed. */
  unknown?: string;
}

/** One item id → display name/ilvl/quality, build first, wowtbc gap item second. */
export function resolveItemName(
  id: number,
  byId: Map<number, ForeverItem> | null,
  wowtbc: WowtbcExtract | null,
): Pick<NamedLootEntry, "name" | "item_level" | "quality" | "data_source" | "unknown"> {
  const item = byId?.get(id);
  if (item) return { name: item.name, item_level: item.item_level, quality: item.quality };
  const gap = wowtbc?.gap_items[String(id)];
  if (gap) return { name: gap.name, item_level: gap.item_level, quality: gap.quality, data_source: WOWTBC_SOURCE };
  return {
    name: null,
    item_level: null,
    quality: null,
    unknown: byId
      ? `item ${id} has no ItemSparse row in the ingested Forever build${wowtbc ? " and is not in the wowtbc tables" : " (no wowtbc extract ingested)"}`
      : "no Forever catalog ingested — run: bun run src/forever.ts --ingest",
  };
}

/**
 * Attaches catalog names/ilvls to a boss's loot rows.
 *
 * An id the build does not carry falls back to a wowtbc gap item (marked with
 * `data_source`), and otherwise is reported as unknown rather than dropped.
 */
export function nameLootEntries(
  entries: LootEntry[],
  catalog: ForeverCatalog | null,
  wowtbc: WowtbcExtract | null = null,
): NamedLootEntry[] {
  const byId = catalog ? new Map(catalog.items.map((i) => [i.id, i])) : null;
  return entries.map((entry) => ({ ...entry, ...resolveItemName(entry.item_id, byId, wowtbc) }));
}

export function findInstance(extract: LootExtract, query: string): LootInstance | undefined {
  const needle = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extract.instances.find(
    (i) =>
      i.key.toLowerCase() === query.toLowerCase() ||
      i.key.toLowerCase().replace(/[^a-z0-9]/g, "") === needle ||
      i.name.toLowerCase().replace(/[^a-z0-9]/g, "") === needle,
  );
}

export interface LootAudit {
  catalog_build: string;
  upstream_commit: string;
  totals: { rows: number; resolved: number; unresolved: number };
  by_provenance: Record<"vanilla" | "forever-new", { rows: number; resolved: number; unresolved: number }>;
  /** Instances whose loot rows point at item ids the build does not carry. */
  instances_with_unresolved_rows: {
    key: string;
    name: string;
    provenance: "vanilla" | "forever-new";
    unresolved: number;
    rows: number;
    sample_unresolved_item_ids: number[];
  }[];
}

/**
 * Cross-checks the vendored loot extract against the ingested build.
 *
 * A row whose item id is absent from the catalog is not a bad id: it is an item
 * the build ships without an `ItemSparse` row (no name/stats client-side). Most
 * upstream `forever-new` rows land here, and wowtbc's datamined tables
 * corroborate them — see {@link auditWowtbc}.
 */
export function auditLoot(extract: LootExtract, catalog: ForeverCatalog): LootAudit {
  const known = new Set(catalog.items.map((i) => i.id));
  const totals = { rows: 0, resolved: 0, unresolved: 0 };
  const byProvenance: LootAudit["by_provenance"] = {
    vanilla: { rows: 0, resolved: 0, unresolved: 0 },
    "forever-new": { rows: 0, resolved: 0, unresolved: 0 },
  };
  const perInstance: LootAudit["instances_with_unresolved_rows"] = [];

  for (const instance of extract.instances) {
    let rows = 0;
    const unresolvedIds: number[] = [];
    for (const boss of instance.bosses) {
      for (const entries of Object.values(boss.difficulties)) {
        for (const entry of entries) {
          rows++;
          totals.rows++;
          const bucket = byProvenance[entry.provenance];
          bucket.rows++;
          if (known.has(entry.item_id)) {
            totals.resolved++;
            bucket.resolved++;
          } else {
            totals.unresolved++;
            bucket.unresolved++;
            unresolvedIds.push(entry.item_id);
          }
        }
      }
    }
    if (unresolvedIds.length > 0) {
      perInstance.push({
        key: instance.key,
        name: instance.name,
        provenance: instance.provenance,
        unresolved: unresolvedIds.length,
        rows,
        sample_unresolved_item_ids: unresolvedIds.slice(0, 5),
      });
    }
  }
  perInstance.sort((a, b) => b.unresolved - a.unresolved);

  return {
    catalog_build: catalog.meta.build,
    upstream_commit: extract.meta.upstream.commit,
    totals,
    by_provenance: byProvenance,
    instances_with_unresolved_rows: perInstance,
  };
}

/**
 * Where an item drops, per the vendored extract only.
 *
 * An empty result means "not present in the reused-Vanilla tables", not "drops
 * from nothing" — callers must surface that distinction.
 */
export function findItemSources(extract: LootExtract, itemId: number): {
  instance: string;
  boss: string;
  difficulty: string;
  loot_status: LootStatus;
  provenance: "vanilla" | "forever-new";
}[] {
  const out: ReturnType<typeof findItemSources> = [];
  for (const instance of extract.instances) {
    for (const boss of instance.bosses) {
      for (const [difficulty, entries] of Object.entries(boss.difficulties)) {
        for (const entry of entries) {
          if (entry.item_id === itemId) {
            out.push({
              instance: instance.name,
              boss: boss.name,
              difficulty,
              loot_status: boss.loot_status,
              provenance: entry.provenance,
            });
          }
        }
      }
    }
  }
  return out;
}

// --- wowtbc cross-check ---------------------------------------------------

export interface WowtbcBossComparison {
  dungeon: string;
  boss: string;
  /** Present in both mappings. */
  agree: number;
  only_wowtbc: number[];
  only_atlasloot: number[];
}

export interface WowtbcAudit {
  wowtbc_fetched_at: string;
  dungeons_matched: number;
  /** wowtbc dungeons with no AtlasLoot instance (and vice versa, dungeons only). */
  dungeons_only_wowtbc: string[];
  dungeons_only_atlasloot: string[];
  bosses_matched: number;
  bosses_only_wowtbc: { dungeon: string; boss: string }[];
  mappings: { agree: number; only_wowtbc: number; only_atlasloot: number };
  /** Matched bosses whose item lists differ. */
  disagreements: WowtbcBossComparison[];
  /**
   * AtlasLoot rows the build cannot name (no `ItemSparse` row) that wowtbc
   * lists — i.e. real items corroborated by a second datamine, not bad ids.
   */
  atlasloot_unresolved_rows_in_wowtbc: Record<"vanilla" | "forever-new", { unresolved: number; in_wowtbc: number }>;
  /**
   * wowtbc primary stats vs the build's computed stats, for items in both, via
   * {@link CROSSCHECK_STAT_MAP}. A validation check only — wowtbc is computed from
   * the same client data, so agreement is consistency, not independent evidence.
   */
  stat_crosscheck: {
    items_compared: number;
    values_compared: number;
    values_matching: number;
    mismatches: { item_id: number; stat: string; wowtbc: number | string; build: number | null }[];
  };
}

function atlasItemIds(boss: LootBoss): Set<number> {
  const ids = new Set<number>();
  for (const entries of Object.values(boss.difficulties)) for (const e of entries) ids.add(e.item_id);
  return ids;
}

/**
 * Compare wowtbc's boss → item mappings with AtlasLoot's, and wowtbc's stats
 * with the build's. Nothing is retired either way: this reports disagreement.
 *
 * AtlasLoot's trash/key pseudo-bosses and raids are out of wowtbc's scope, so
 * only named bosses in dungeons both sources list are compared.
 */
export function auditWowtbc(wowtbc: WowtbcExtract, extract: LootExtract, catalog: ForeverCatalog): WowtbcAudit {
  const matched: { w: WowtbcExtract["dungeons"][string]; a: LootInstance }[] = [];
  const onlyWowtbc: string[] = [];
  for (const d of Object.values(wowtbc.dungeons)) {
    const a = extract.instances.find((i) => sameName(i.name, d.name) || sameName(i.key, d.name) || sameName(i.key, d.key));
    if (a) matched.push({ w: d, a });
    else onlyWowtbc.push(d.name);
  }
  const onlyAtlas = extract.instances
    .filter((i) => i.content_type === "Dungeons" && !matched.some((m) => m.a.key === i.key))
    .map((i) => i.name);

  const mappings = { agree: 0, only_wowtbc: 0, only_atlasloot: 0 };
  const disagreements: WowtbcBossComparison[] = [];
  const bossesOnlyWowtbc: WowtbcAudit["bosses_only_wowtbc"] = [];
  let bossesMatched = 0;
  for (const { w, a } of matched) {
    for (const [bossName, boss] of Object.entries(w.bosses)) {
      const atlasBoss = a.bosses.find((b) => sameName(b.name, bossName));
      if (!atlasBoss) {
        bossesOnlyWowtbc.push({ dungeon: w.name, boss: bossName });
        continue;
      }
      bossesMatched++;
      const atlasIds = atlasItemIds(atlasBoss);
      const wowtbcIds = new Set(boss.item_ids);
      const agree = [...wowtbcIds].filter((id) => atlasIds.has(id)).length;
      const onlyW = [...wowtbcIds].filter((id) => !atlasIds.has(id));
      const onlyA = [...atlasIds].filter((id) => !wowtbcIds.has(id));
      mappings.agree += agree;
      mappings.only_wowtbc += onlyW.length;
      mappings.only_atlasloot += onlyA.length;
      if (onlyW.length > 0 || onlyA.length > 0) {
        disagreements.push({ dungeon: w.name, boss: bossName, agree, only_wowtbc: onlyW, only_atlasloot: onlyA });
      }
    }
  }

  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const corroborated: WowtbcAudit["atlasloot_unresolved_rows_in_wowtbc"] = {
    vanilla: { unresolved: 0, in_wowtbc: 0 },
    "forever-new": { unresolved: 0, in_wowtbc: 0 },
  };
  for (const instance of extract.instances) {
    for (const boss of instance.bosses) {
      for (const entries of Object.values(boss.difficulties)) {
        for (const entry of entries) {
          if (byId.has(entry.item_id)) continue;
          corroborated[entry.provenance].unresolved++;
          if (wowtbc.items[String(entry.item_id)]) corroborated[entry.provenance].in_wowtbc++;
        }
      }
    }
  }
  const statCheck: WowtbcAudit["stat_crosscheck"] = { items_compared: 0, values_compared: 0, values_matching: 0, mismatches: [] };
  for (const item of Object.values(wowtbc.items)) {
    const built = byId.get(item.id);
    const primary = item.upstream_stats.primary;
    if (!built || !primary) continue;
    let compared = false;
    for (const [name, value] of Object.entries(primary)) {
      const statName = CROSSCHECK_STAT_MAP[name];
      if (!statName) continue;
      compared = true;
      statCheck.values_compared++;
      const buildValue = built.stats.find((s) => s.stat === statName)?.value ?? null;
      if (buildValue === value) statCheck.values_matching++;
      else statCheck.mismatches.push({ item_id: item.id, stat: statName, wowtbc: value, build: buildValue });
    }
    if (compared) statCheck.items_compared++;
  }

  return {
    wowtbc_fetched_at: wowtbc.meta.fetched_at,
    dungeons_matched: matched.length,
    dungeons_only_wowtbc: onlyWowtbc,
    dungeons_only_atlasloot: onlyAtlas,
    bosses_matched: bossesMatched,
    bosses_only_wowtbc: bossesOnlyWowtbc,
    mappings,
    disagreements,
    atlasloot_unresolved_rows_in_wowtbc: corroborated,
    stat_crosscheck: statCheck,
  };
}

/** Provenance-stamped wowtbc facts about one item, for the CLI. */
export function wowtbcItemFacts(wowtbc: WowtbcExtract, id: number): {
  provenance: WowtbcProvenance;
  content: "vanilla" | "forever-new";
  upstream_stats: WowtbcUpstreamStats;
  vanilla_drop_chance: number | null;
} | null {
  const item = wowtbc.items[String(id)];
  if (!item) return null;
  return {
    provenance: item.provenance,
    content: item.content,
    upstream_stats: item.upstream_stats,
    vanilla_drop_chance: item.vanilla_drop_chance,
  };
}
