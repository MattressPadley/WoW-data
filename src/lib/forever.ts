/**
 * WoW Forever data loader.
 *
 * Forever is Vanilla content on the retail engine. Its data source map differs
 * from retail: the Blizzard API is dark for the beta, so everything here comes
 * from wago.tools DB2 exports for the Forever build plus a vendored offline
 * extract of reused-Vanilla loot tables.
 *
 * Hard rule: nothing in this file (or anything it imports) may construct
 * `WoWAPI` or touch `src/lib/dungeon-loot.ts` / `src/lib/journal.ts`. The
 * Blizzard namespace form (`static-<region>`) has no Forever variant, so any
 * Encounter Journal call here would fail. Forever loot comes from `forever/loot/`.
 *
 * Never fabricate a drop source or a stat value: anything we cannot derive is
 * reported as explicitly unknown.
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
const CATALOG_FILE = `${CATALOG_DIR}/items.json`;
const LOOT_FILE = `${LOOT_DIR}/dungeon-loot.json`;

export const FOREVER_TABLES = [
  "ItemSparse",
  "Item",
  "ItemEffect",
  "ItemXItemEffect",
  "SpellName",
  "ItemSet",
  "ItemSetSpell",
  "RandPropPoints",
  "AreaTable",
  "Map",
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
}

export async function loadEnums(): Promise<ForeverEnums> {
  const [statType, quality, inventoryType] = await Promise.all([
    loadEnumSnapshot("ItemStatType"),
    loadEnumSnapshot("ItemQuality"),
    loadEnumSnapshot("InventoryType"),
  ]);
  return { statType, quality, inventoryType };
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

// --- Item catalog ---------------------------------------------------------

export interface ForeverItemEffect {
  spell_id: number;
  spell_name: string | null;
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
  bonding: number;
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

export async function ingestCatalog(build: string, noCache: boolean): Promise<ForeverCatalog> {
  const opts = foreverOptions(build);
  const [itemSparseText, itemText, itemEffectText, itemXEffectText, spellNameText, itemSetText, itemSetSpellText, rppText, areaText, mapText] =
    await Promise.all([
      getCachedCsv("ItemSparse", noCache, opts),
      getCachedCsv("Item", noCache, opts),
      getCachedCsv("ItemEffect", noCache, opts),
      getCachedCsv("ItemXItemEffect", noCache, opts),
      getCachedCsv("SpellName", noCache, opts),
      getCachedCsv("ItemSet", noCache, opts),
      getCachedCsv("ItemSetSpell", noCache, opts),
      getCachedCsv("RandPropPoints", noCache, opts),
      getCachedCsv("AreaTable", noCache, opts),
      getCachedCsv("Map", noCache, opts),
    ]);

  const enums = await loadEnums();
  const sparseRows = parseCsv(itemSparseText);
  const items = indexBy(parseCsv(itemText), "ID");
  const effects = indexBy(parseCsv(itemEffectText), "ID");
  // ItemEffect has no ParentItemID — ItemXItemEffect is the join.
  const effectsByItem = indexByMulti(parseCsv(itemXEffectText), "ItemID");
  // The `Spell` table is text-only; SpellName carries the name.
  const spellNames = indexBy(parseCsv(spellNameText), "ID");
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
      itemEffects.push({
        spell_id: spellId,
        spell_name: spellName(spellId),
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

    catalogItems.push({
      id,
      name: row["Display_lang"] ?? "",
      item_level: itemLevel,
      required_level: num(row, "RequiredLevel"),
      quality_id: qualityId,
      quality: enums.quality.values[String(qualityId)] ?? null,
      inventory_type_id: inventoryTypeId,
      inventory_type: enums.inventoryType.values[String(inventoryTypeId)] ?? null,
      class_id: itemRow ? num(itemRow, "ClassID") : null,
      subclass_id: itemRow ? num(itemRow, "SubclassID") : null,
      bonding: num(row, "Bonding"),
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
      stat_type_enum_build: enums.statType.build,
    },
    items: catalogItems,
    item_sets: itemSets,
    zones,
    maps,
  };

  await mkdir(CATALOG_DIR, { recursive: true });
  await Bun.write(CATALOG_FILE, JSON.stringify(catalog));
  return catalog;
}

export async function loadCatalog(): Promise<ForeverCatalog> {
  const file = Bun.file(CATALOG_FILE);
  if (!(await file.exists())) {
    throw new Error(`No Forever catalog at ${CATALOG_FILE} — run: ./run src/forever.ts --ingest`);
  }
  return (await file.json()) as ForeverCatalog;
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

export interface NamedLootEntry extends LootEntry {
  /** Resolved from the ingested catalog; null when the build has no such item. */
  name: string | null;
  item_level: number | null;
  quality: string | null;
  /** Present when the item id is not in the ingested build. Never guessed. */
  unknown?: string;
}

/**
 * Attaches catalog names/ilvls to a boss's loot rows.
 *
 * An id the build does not carry is reported as unknown rather than dropped —
 * a stale upstream row is information, not something to hide.
 */
export function nameLootEntries(entries: LootEntry[], catalog: ForeverCatalog | null): NamedLootEntry[] {
  const byId = catalog ? new Map(catalog.items.map((i) => [i.id, i])) : null;
  return entries.map((entry) => {
    const item = byId?.get(entry.item_id);
    if (!item) {
      return {
        ...entry,
        name: null,
        item_level: null,
        quality: null,
        unknown: byId
          ? `item ${entry.item_id} is not in the ingested Forever build`
          : "no Forever catalog ingested — run: bun run src/forever.ts --ingest",
      };
    }
    return { ...entry, name: item.name, item_level: item.item_level, quality: item.quality };
  });
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
 * This is the honesty check on the extract: a row whose item id is absent from
 * the build is speculative, which in practice is how most upstream
 * `forever-new` rows resolve.
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
