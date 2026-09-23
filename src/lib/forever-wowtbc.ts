/**
 * wowtbc.gg "Warcraft Forever" dungeon loot tables — a datamined, community
 * source layered onto (never replacing) the wago catalog and the AtlasLoot
 * extract.
 *
 * Upstream publishes each dungeon as a Gatsby `page-data.json`: items with
 * names, upstream stats, ilvl and icon (`gearData`), plus the boss → item and
 * quest → item lists (`loot[]`). That closes two gaps the client cannot:
 *
 *   1. name/stats for items wago's `Item` table lists with no `ItemSparse` row
 *      (the "gap" items — mostly Vanilla, some Forever-new), and
 *   2. which boss or quest an item comes from.
 *
 * Load-bearing rules (see `docs/forever-data.md`):
 *
 * - **wago stays authoritative per field.** For an item the build knows, wowtbc
 *   supplies only what wago lacks and the source. Even a gap item keeps its wago
 *   `Item`-table class/slot/icon when those exist.
 * - **Upstream stat names are kept raw**, under `upstream_stats`, and never put
 *   where a build-computed stat would go.
 * - **Everything is provenance-stamped**: source, upstream `discovered`
 *   (true / false / null), fetch date. Datamined, not observed.
 * - **Drop chances are Vanilla-observed.** Carried only for non-new content,
 *   as `vanilla_drop_chance`; never for Forever-new items.
 * - **No fabrication.** A dungeon upstream lists with no items and no bosses
 *   (Shaper's Terrace) is `unknown`, not empty-and-complete.
 *
 * Nothing here may construct `WoWAPI` or reach the Blizzard API — this file is
 * on the Forever import graph gated by `forever-isolation.test.ts`.
 */

import { mkdir, stat } from "node:fs/promises";
import { cachedFetch, getCachedCsv, indexBy, parseCsv, type Row } from "./wago.ts";

export const WOWTBC_SOURCE = "wowtbc-warcraftforever" as const;
const WOWTBC_ORIGIN = "https://wowtbc.gg";
const WOWTBC_INDEX_PATH = "/warcraftforever/loot-tables/dungeons/";
const CACHE_DIR = "data/cache/wowtbc-forever";
/** Derived output. Gitignored: upstream publishes no license, so it is never redistributed. */
export const WOWTBC_FILE = "forever/loot/wowtbc-dungeons.json";

/** wowtbc serves Gatsby page-data to browsers; identify as one. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  Accept: "application/json",
};

/** Upstream's pseudo-boss for trash drops. Not an encounter. */
const TRASH_BOSS = "Trash";

/**
 * First item id of the Forever-new band.
 *
 * Every item upstream lists for a new dungeon, and every id upstream flags in a
 * quest's `new` list, sits at or above this; every item carrying a Vanilla drop
 * chance sits below it. Checked on each ingest — a violation is reported in
 * `meta.notes`, not silently absorbed.
 */
export const FOREVER_NEW_ITEM_ID_FLOOR = 250000;

// --- Upstream shapes ------------------------------------------------------

interface UpstreamDungeonLink {
  name: string;
  path: string;
  levels: number[];
  isNew: boolean;
}

interface UpstreamItem {
  id: number;
  name: string;
  discovered?: boolean | null;
  rarity?: string;
  bind?: string;
  slot?: string;
  type?: string;
  ilvl?: number;
  icon?: string;
  unique?: boolean;
  set?: string;
  set_id?: number;
  drop_chance?: number;
  source?: string;
  source_type?: string;
  primary_stats?: Record<string, number | string> | null;
  secondary_stats?: Record<string, number | string> | null;
  special_stats?: Record<string, number | string> | null;
  other_stats?: Record<string, number | string> | null;
}

interface UpstreamLoot {
  dungeon: string;
  levels?: number[];
  new?: boolean;
  bosses?: { name: string; items: number[] }[];
  quests?: { name: string; items: number[]; level?: number; faction?: string; new?: number[] }[];
}

interface UpstreamDungeonPage {
  result: { pageContext: { dungeon?: string; gearData?: UpstreamItem[]; loot?: UpstreamLoot[] } };
}

// --- Derived shapes -------------------------------------------------------

/** Stamped on every wowtbc-sourced row. Datamined/community, never build-derived or observed. */
export interface WowtbcProvenance {
  source: typeof WOWTBC_SOURCE;
  /** Upstream's `discovered` flag, tri-state: `null` means upstream did not say. */
  discovered: boolean | null;
  /** When the dungeon page was fetched (the cache file's mtime). */
  fetched_at: string;
}

export type WowtbcSourceKind = "boss" | "trash" | "quest";

export interface WowtbcItemSource {
  dungeon_key: string;
  dungeon: string;
  kind: WowtbcSourceKind;
  /** Boss or quest name; null for trash. */
  name: string | null;
  /** Quest faction restriction, when upstream gives one. */
  faction?: string;
}

/** Upstream stat blocks, verbatim. Names are wowtbc's (`spell_damage`, `spirit`), not `ItemStatType`. */
export interface WowtbcUpstreamStats {
  primary?: Record<string, number | string>;
  secondary?: Record<string, number | string>;
  special?: Record<string, number | string>;
  other?: Record<string, number | string>;
}

export interface WowtbcItem {
  id: number;
  name: string;
  provenance: WowtbcProvenance;
  /** `forever-new` when the dungeon is new, upstream flags the id new, or it is in the new id band. */
  content: "vanilla" | "forever-new";
  /** Upstream fields, raw. */
  rarity: string | null;
  bind: string | null;
  slot: string | null;
  type: string | null;
  item_level: number | null;
  icon: string | null;
  unique: boolean;
  set: { id: number; name: string } | null;
  upstream_stats: WowtbcUpstreamStats;
  /** Vanilla-observed drop chance (0–1). Only on `content: vanilla` items; never for new content. */
  vanilla_drop_chance: number | null;
  sources: WowtbcItemSource[];
}

export interface WowtbcQuest {
  name: string;
  level: number | null;
  faction: string | null;
  item_ids: number[];
  /** Ids upstream itself flags as new rewards on this quest. */
  new_item_ids: number[];
}

export interface WowtbcDungeon {
  key: string;
  name: string;
  url: string;
  levels: number[] | null;
  is_new: boolean;
  /** `unknown` = upstream lists the dungeon with no items and no bosses. Never read as "drops nothing". */
  status: "listed" | "unknown";
  unknown: string[];
  fetched_at: string;
  /** Boss name → item ids. Excludes upstream's `Trash` pseudo-boss. */
  bosses: Record<string, { item_ids: number[] }>;
  /** Trash drops (upstream's `Trash` pseudo-boss), or null when upstream has none. */
  trash: { item_ids: number[] } | null;
  quests: WowtbcQuest[];
}

/** Where a gap item's field value came from. */
export type GapFieldSource = "wago-item" | "wago-itemset" | typeof WOWTBC_SOURCE;

/**
 * A catalog entry for an item the build has no `ItemSparse` row for.
 *
 * wago `Item`-table fields win wherever they exist; wowtbc fills the rest.
 * `field_sources` records which is which, per field. There is deliberately no
 * `stats` / `armor` / `weapon` field: those mean *build-computed* elsewhere, and
 * nothing here is. Upstream's numbers live raw under `upstream_stats`.
 */
export interface ForeverGapItem {
  id: number;
  name: string;
  item_level: number | null;
  required_level: number | null;
  quality: string | null;
  binding: string | null;
  inventory_type_id: number | null;
  inventory_type: string | null;
  class_id: number | null;
  subclass_id: number | null;
  item_class: string | null;
  item_subclass: string | null;
  icon: string | null;
  item_set: { id: number; name: string } | null;
  upstream_slot: string | null;
  upstream_type: string | null;
  upstream_stats: WowtbcUpstreamStats;
  /** True when wago's `Item` table has the id (just no `ItemSparse` row). */
  in_wago_item_table: boolean;
  field_sources: Record<string, GapFieldSource>;
  provenance: WowtbcProvenance;
  content: "vanilla" | "forever-new";
}

export interface WowtbcExtract {
  meta: {
    source: typeof WOWTBC_SOURCE;
    upstream: string;
    license: string;
    generated_at: string;
    /** Oldest page fetch among the dungeons — the extract is at least this stale. */
    fetched_at: string;
    catalog_build: string;
    dungeon_count: number;
    new_dungeon_count: number;
    unknown_dungeons: string[];
    item_count: number;
    gap_item_count: number;
    gap_items_by_content: Record<"vanilla" | "forever-new", number>;
    boss_count: number;
    boss_item_mappings: number;
    trash_item_mappings: number;
    quest_count: number;
    quest_item_mappings: number;
    discovered: { true: number; false: number; null: number };
    notes: string[];
  };
  dungeons: Record<string, WowtbcDungeon>;
  /** Every upstream item, id-indexed, raw + provenance + sources. */
  items: Record<string, WowtbcItem>;
  /** Items the build has no `ItemSparse` row for, composed per field. Id-indexed. */
  gap_items: Record<string, ForeverGapItem>;
}

// --- Fetch ----------------------------------------------------------------

function pageDataUrl(path: string): string {
  return `${WOWTBC_ORIGIN}/page-data${path}page-data.json`;
}

function slugOf(path: string): string {
  return path.replace(/\/$/, "").split("/").pop() ?? path;
}

/** Fetch (or reuse, within 24h) one page-data file; returns the text and when it was fetched. */
async function fetchPageData(path: string, cacheName: string, noCache: boolean): Promise<{ text: string; fetched_at: string }> {
  const cachePath = `${CACHE_DIR}/${cacheName}.page-data.json`;
  const text = await cachedFetch(pageDataUrl(path), cachePath, noCache, false, `wowtbc ${path}`, BROWSER_HEADERS);
  const fetched = await stat(cachePath);
  return { text, fetched_at: new Date(fetched.mtimeMs).toISOString() };
}

// --- Pure derivation ------------------------------------------------------

/** Declared mapping from wowtbc `rarity` to the snapshotted `ItemQuality` enum name. */
export const RARITY_TO_QUALITY_ID: Record<string, number> = {
  poor: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

/** Declared mapping from wowtbc `bind` to the snapshotted `ItemBonding` enum id. */
export const BIND_TO_BONDING_ID: Record<string, number> = {
  bop: 1,
  boe: 2,
  bou: 3,
  quest: 4,
};

/**
 * Declared mapping from wowtbc primary-stat names to `ItemStatType` enum names.
 *
 * Used **only** to cross-check wowtbc against the build's computed stats, never
 * to present a value. `spirit` is deliberately absent: the enum's id 6 is
 * `SPIRIT_UNUSED`, and `spell_damage` / `spell_healing` have no clean match.
 */
export const CROSSCHECK_STAT_MAP: Record<string, string> = {
  strength: "STRENGTH",
  agility: "AGILITY",
  stamina: "STAMINA",
  intellect: "INTELLECT",
};

function nonEmpty(block: Record<string, number | string> | null | undefined): Record<string, number | string> | undefined {
  return block && Object.keys(block).length > 0 ? block : undefined;
}

function upstreamStats(item: UpstreamItem): WowtbcUpstreamStats {
  const out: WowtbcUpstreamStats = {};
  const primary = nonEmpty(item.primary_stats);
  const secondary = nonEmpty(item.secondary_stats);
  const special = nonEmpty(item.special_stats);
  const other = nonEmpty(item.other_stats);
  if (primary) out.primary = primary;
  if (secondary) out.secondary = secondary;
  if (special) out.special = special;
  if (other) out.other = other;
  return out;
}

export interface DungeonPage {
  link: UpstreamDungeonLink;
  url: string;
  fetched_at: string;
  gear: UpstreamItem[];
  loot: UpstreamLoot[];
}

/** One upstream dungeon page → its boss/trash/quest mapping. Pure. */
export function deriveDungeon(page: DungeonPage): WowtbcDungeon {
  const key = slugOf(page.link.path);
  const bosses: WowtbcDungeon["bosses"] = {};
  let trash = null as WowtbcDungeon["trash"];
  const quests: WowtbcQuest[] = [];
  for (const block of page.loot) {
    for (const boss of block.bosses ?? []) {
      if (boss.name === TRASH_BOSS) {
        trash = { item_ids: [...(trash?.item_ids ?? []), ...boss.items] };
      } else {
        const existing = bosses[boss.name];
        bosses[boss.name] = { item_ids: [...(existing?.item_ids ?? []), ...boss.items] };
      }
    }
    for (const quest of block.quests ?? []) {
      quests.push({
        name: quest.name,
        level: quest.level ?? null,
        faction: quest.faction ?? null,
        item_ids: quest.items,
        new_item_ids: quest.new ?? [],
      });
    }
  }
  const empty = page.gear.length === 0 && Object.keys(bosses).length === 0 && trash === null && quests.length === 0;
  return {
    key,
    name: page.link.name,
    url: `${WOWTBC_ORIGIN}${page.link.path}`,
    levels: page.link.levels ?? null,
    is_new: page.link.isNew,
    status: empty ? "unknown" : "listed",
    unknown: empty ? ["upstream lists this dungeon with no items, bosses or quests — its loot is unknown, not empty"] : [],
    fetched_at: page.fetched_at,
    bosses,
    trash,
    quests,
  };
}

/** Where each item id appears in a derived dungeon. */
function sourcesIn(dungeon: WowtbcDungeon): Map<number, WowtbcItemSource[]> {
  const out = new Map<number, WowtbcItemSource[]>();
  const add = (id: number, source: WowtbcItemSource) => {
    const list = out.get(id);
    if (list) list.push(source);
    else out.set(id, [source]);
  };
  for (const [name, boss] of Object.entries(dungeon.bosses)) {
    for (const id of boss.item_ids) add(id, { dungeon_key: dungeon.key, dungeon: dungeon.name, kind: "boss", name });
  }
  for (const id of dungeon.trash?.item_ids ?? []) {
    add(id, { dungeon_key: dungeon.key, dungeon: dungeon.name, kind: "trash", name: null });
  }
  for (const quest of dungeon.quests) {
    for (const id of quest.item_ids) {
      add(id, {
        dungeon_key: dungeon.key,
        dungeon: dungeon.name,
        kind: "quest",
        name: quest.name,
        ...(quest.faction ? { faction: quest.faction } : {}),
      });
    }
  }
  return out;
}

/** Is this item Forever-new content? Any one signal is enough; absence of all is `vanilla`. */
export function classifyContent(id: number, dungeonIsNew: boolean, flaggedNew: boolean): "vanilla" | "forever-new" {
  return dungeonIsNew || flaggedNew || id >= FOREVER_NEW_ITEM_ID_FLOOR ? "forever-new" : "vanilla";
}

/** One upstream item row → a provenance-stamped item. Pure. */
export function deriveItem(
  raw: UpstreamItem,
  dungeon: WowtbcDungeon,
  sources: WowtbcItemSource[],
  flaggedNew: boolean,
): WowtbcItem {
  const content = classifyContent(raw.id, dungeon.is_new, flaggedNew);
  const dropChance = typeof raw.drop_chance === "number" ? raw.drop_chance : null;
  return {
    id: raw.id,
    name: raw.name,
    provenance: {
      source: WOWTBC_SOURCE,
      // Upstream omits the key on some rows; that is "not stated", not "false".
      discovered: typeof raw.discovered === "boolean" ? raw.discovered : null,
      fetched_at: dungeon.fetched_at,
    },
    content,
    rarity: raw.rarity ?? null,
    bind: raw.bind ?? null,
    slot: raw.slot ?? null,
    type: raw.type ?? null,
    item_level: typeof raw.ilvl === "number" ? raw.ilvl : null,
    icon: raw.icon ?? null,
    unique: raw.unique === true,
    set: raw.set_id !== undefined && raw.set ? { id: raw.set_id, name: raw.set } : null,
    upstream_stats: upstreamStats(raw),
    // Vanilla-observed only. A new-content drop rate would be a fabrication.
    vanilla_drop_chance: content === "vanilla" ? dropChance : null,
    sources,
  };
}

/** The wago lookups a gap item is composed against. */
export interface WagoItemContext {
  /** wago `Item` rows by id. */
  items: Map<string, Row>;
  classNames: Map<string, string>;
  subclassNames: Map<string, string>;
  iconManifest: Map<string, Row>;
  inventoryTypes: Record<string, string>;
  qualities: Record<string, string>;
  bondings: Record<string, string>;
  /** wago `ItemSet` membership by item id — the build's own set data. */
  setsByItem: Map<number, { id: number; name: string }>;
}

function iconName(fileDataId: number, manifest: Map<string, Row>): string | null {
  if (!fileDataId) return null;
  const fileName = manifest.get(String(fileDataId))?.["FileName"];
  if (!fileName) return null;
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

/**
 * Compose a catalog entry for an item the build has no `ItemSparse` row for.
 *
 * Per field: the wago `Item` table's value if it has one, else wowtbc's, else
 * null. `field_sources` records the winner for every non-null field.
 */
export function composeGapItem(item: WowtbcItem, ctx: WagoItemContext): ForeverGapItem {
  const row = ctx.items.get(String(item.id));
  const fieldSources: Record<string, GapFieldSource> = {};
  const take = <T>(field: string, wago: T | null, wowtbc: T | null): T | null => {
    if (wago !== null && wago !== undefined) {
      fieldSources[field] = "wago-item";
      return wago;
    }
    if (wowtbc !== null && wowtbc !== undefined) {
      fieldSources[field] = WOWTBC_SOURCE;
      return wowtbc;
    }
    return null;
  };
  const takeSet = (wago: { id: number; name: string } | null, wowtbc: { id: number; name: string } | null) => {
    if (wago) {
      fieldSources["item_set"] = "wago-itemset";
      return wago;
    }
    return take("item_set", null, wowtbc);
  };
  const wagoNum = (key: string): number | null => {
    const v = row?.[key];
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const classId = wagoNum("ClassID");
  const subclassId = wagoNum("SubclassID");
  // `Item.InventoryType` 0 is "Non-equippable" — only trust it when it says something.
  const invTypeRaw = wagoNum("InventoryType");
  const inventoryTypeId = invTypeRaw !== null && invTypeRaw > 0 ? invTypeRaw : null;
  const qualityId = item.rarity ? RARITY_TO_QUALITY_ID[item.rarity] : undefined;
  const bondingId = item.bind ? BIND_TO_BONDING_ID[item.bind] : undefined;
  const minLevel = item.upstream_stats.other?.["min_level"];

  const out: ForeverGapItem = {
    id: item.id,
    name: take("name", null, item.name)!,
    item_level: take("item_level", null, item.item_level),
    required_level: take("required_level", null, typeof minLevel === "number" ? minLevel : null),
    quality: take("quality", null, qualityId !== undefined ? ctx.qualities[String(qualityId)] ?? null : null),
    binding: take("binding", null, bondingId !== undefined ? ctx.bondings[String(bondingId)] ?? null : null),
    class_id: take("class_id", classId, null),
    subclass_id: take("subclass_id", subclassId, null),
    item_class: take("item_class", classId !== null ? ctx.classNames.get(String(classId)) || null : null, null),
    item_subclass: take(
      "item_subclass",
      classId !== null ? ctx.subclassNames.get(`${classId}/${subclassId}`) || null : null,
      null,
    ),
    inventory_type_id: take("inventory_type_id", inventoryTypeId, null),
    inventory_type: take(
      "inventory_type",
      inventoryTypeId !== null ? ctx.inventoryTypes[String(inventoryTypeId)] ?? null : null,
      null,
    ),
    icon: take("icon", row ? iconName(wagoNum("IconFileDataID") ?? 0, ctx.iconManifest) : null, item.icon),
    item_set: takeSet(ctx.setsByItem.get(item.id) ?? null, item.set),
    upstream_slot: item.slot,
    upstream_type: item.type,
    upstream_stats: item.upstream_stats,
    in_wago_item_table: row !== undefined,
    field_sources: fieldSources,
    provenance: item.provenance,
    content: item.content,
  };
  return out;
}

/**
 * Pages → the full extract. Pure given its inputs, so it is unit-testable
 * without the network.
 *
 * @param sparseIds ids the build has an `ItemSparse` row for (i.e. in the catalog).
 */
export function buildExtract(
  pages: DungeonPage[],
  sparseIds: Set<number>,
  wago: WagoItemContext,
  catalogBuild: string,
  now: string,
): WowtbcExtract {
  const dungeons: Record<string, WowtbcDungeon> = {};
  const items: Record<string, WowtbcItem> = {};
  const notes: string[] = [];

  for (const page of pages) {
    const dungeon = deriveDungeon(page);
    dungeons[dungeon.key] = dungeon;
    const sources = sourcesIn(dungeon);
    const flaggedNew = new Set(dungeon.quests.flatMap((q) => q.new_item_ids));

    for (const raw of page.gear) {
      const itemSources = sources.get(raw.id) ?? [];
      const existing = items[String(raw.id)];
      if (existing) {
        // Seen in an earlier dungeon: merge sources, keep the first row's fields —
        // except the content class, which is new if *any* listing says so. A later
        // new-dungeon listing must still strip a Vanilla drop chance.
        if (existing.content === "vanilla" && classifyContent(raw.id, dungeon.is_new, flaggedNew.has(raw.id)) === "forever-new") {
          existing.content = "forever-new";
          existing.vanilla_drop_chance = null;
        }
        for (const s of itemSources) {
          if (!existing.sources.some((e) => e.dungeon_key === s.dungeon_key && e.kind === s.kind && e.name === s.name)) {
            existing.sources.push(s);
          }
        }
        continue;
      }
      items[String(raw.id)] = deriveItem(raw, dungeon, itemSources, flaggedNew.has(raw.id));
    }

    // A mapping to an id with no gearData row is kept (it is upstream's claim) but noted.
    for (const id of sources.keys()) {
      if (!page.gear.some((g) => g.id === id)) notes.push(`${dungeon.name}: item ${id} is mapped but has no gearData row`);
    }
  }

  // Band check: the floor must separate new from Vanilla-observed rows.
  for (const item of Object.values(items)) {
    const newSignal = item.sources.some((s) => dungeons[s.dungeon_key]?.is_new) ||
      Object.values(dungeons).some((d) => d.quests.some((q) => q.new_item_ids.includes(item.id)));
    if (newSignal && item.id < FOREVER_NEW_ITEM_ID_FLOOR) {
      notes.push(`item ${item.id} is flagged new upstream but sits below the new-band floor ${FOREVER_NEW_ITEM_ID_FLOOR}`);
    }
  }

  const gapItems: Record<string, ForeverGapItem> = {};
  const gapByContent = { vanilla: 0, "forever-new": 0 };
  for (const item of Object.values(items)) {
    if (sparseIds.has(item.id)) continue;
    gapItems[String(item.id)] = composeGapItem(item, wago);
    gapByContent[item.content]++;
  }

  const dungeonList = Object.values(dungeons);
  const itemList = Object.values(items);
  const fetchDates = dungeonList.map((d) => d.fetched_at).sort();
  return {
    meta: {
      source: WOWTBC_SOURCE,
      upstream: `${WOWTBC_ORIGIN}${WOWTBC_INDEX_PATH}`,
      license:
        "upstream publishes no license — this file is derived locally and gitignored, never redistributed",
      generated_at: now,
      fetched_at: fetchDates[0] ?? now,
      catalog_build: catalogBuild,
      dungeon_count: dungeonList.length,
      new_dungeon_count: dungeonList.filter((d) => d.is_new).length,
      unknown_dungeons: dungeonList.filter((d) => d.status === "unknown").map((d) => d.name),
      item_count: itemList.length,
      gap_item_count: Object.keys(gapItems).length,
      gap_items_by_content: gapByContent,
      boss_count: dungeonList.reduce((n, d) => n + Object.keys(d.bosses).length, 0),
      boss_item_mappings: dungeonList.reduce(
        (n, d) => n + Object.values(d.bosses).reduce((m, b) => m + b.item_ids.length, 0),
        0,
      ),
      trash_item_mappings: dungeonList.reduce((n, d) => n + (d.trash?.item_ids.length ?? 0), 0),
      quest_count: dungeonList.reduce((n, d) => n + d.quests.length, 0),
      quest_item_mappings: dungeonList.reduce((n, d) => n + d.quests.reduce((m, q) => m + q.item_ids.length, 0), 0),
      discovered: {
        true: itemList.filter((i) => i.provenance.discovered === true).length,
        false: itemList.filter((i) => i.provenance.discovered === false).length,
        null: itemList.filter((i) => i.provenance.discovered === null).length,
      },
      notes: [
        "datamined community data (wowtbc.gg), not build-derived and not observed drops",
        "wago stays authoritative per field; wowtbc fills only what the build lacks, plus the drop/quest source",
        "vanilla_drop_chance is Vanilla-observed and is never carried for Forever-new content",
        "wowtbc lists uncommon+ dungeon loot only — no raids or world bosses (those are AtlasLoot-only)",
        ...notes,
      ],
    },
    dungeons,
    items,
    gap_items: gapItems,
  };
}

// --- Ingest / load --------------------------------------------------------

export interface WowtbcIngestInputs {
  build: string;
  /** Ids the ingested catalog has (i.e. the build's `ItemSparse` rows). */
  sparseIds: Set<number>;
  qualities: Record<string, string>;
  bondings: Record<string, string>;
  inventoryTypes: Record<string, string>;
  /** The catalog's `ItemSet` rows (item id lists). */
  itemSets: { id: number; name: string; item_ids: number[] }[];
  /** Fetches a wago DB2 table for the build (already bound to product/build/noCache). */
  fetchTable?: (name: string) => Promise<string>;
}

/** Fetch the 34 dungeon pages (cached 24h), derive, and write {@link WOWTBC_FILE}. */
export async function ingestWowtbc(inputs: WowtbcIngestInputs, noCache: boolean, wagoProduct: string): Promise<WowtbcExtract> {
  const fetchTable = inputs.fetchTable ??
    ((name: string) => getCachedCsv(name, noCache, { product: wagoProduct, build: inputs.build }));

  const index = await fetchPageData(WOWTBC_INDEX_PATH, "index", noCache);
  const links = (JSON.parse(index.text) as { result: { pageContext: { dungeons: UpstreamDungeonLink[] } } }).result
    .pageContext.dungeons;
  if (!Array.isArray(links) || links.length === 0) throw new Error("wowtbc dungeon index lists no dungeons");

  // Sequential on purpose: ~34 small requests, once per 24h.
  const pages: DungeonPage[] = [];
  for (const link of links) {
    const { text, fetched_at } = await fetchPageData(link.path, slugOf(link.path), noCache);
    const ctx = (JSON.parse(text) as UpstreamDungeonPage).result.pageContext;
    pages.push({ link, url: pageDataUrl(link.path), fetched_at, gear: ctx.gearData ?? [], loot: ctx.loot ?? [] });
  }

  const [itemText, classText, subclassText, manifestText] = await Promise.all([
    fetchTable("Item"),
    fetchTable("ItemClass"),
    fetchTable("ItemSubClass"),
    fetchTable("ManifestInterfaceData"),
  ]);
  const wago: WagoItemContext = {
    items: indexBy(parseCsv(itemText), "ID"),
    classNames: new Map(parseCsv(classText).map((r) => [r["ClassID"] ?? "", r["ClassName_lang"] ?? ""])),
    subclassNames: new Map(
      parseCsv(subclassText).map((r) => [`${r["ClassID"]}/${r["SubClassID"]}`, r["DisplayName_lang"] ?? ""]),
    ),
    iconManifest: indexBy(parseCsv(manifestText), "ID"),
    inventoryTypes: inputs.inventoryTypes,
    qualities: inputs.qualities,
    bondings: inputs.bondings,
    setsByItem: new Map(inputs.itemSets.flatMap((set) => set.item_ids.map((id) => [id, { id: set.id, name: set.name }] as const))),
  };

  const extract = buildExtract(pages, inputs.sparseIds, wago, inputs.build, new Date().toISOString());
  await mkdir(WOWTBC_FILE.slice(0, WOWTBC_FILE.lastIndexOf("/")), { recursive: true });
  await Bun.write(WOWTBC_FILE, JSON.stringify(extract));
  return extract;
}

/** The derived extract, or null when no local ingest has run (it is gitignored). */
export async function loadWowtbc(): Promise<WowtbcExtract | null> {
  const file = Bun.file(WOWTBC_FILE);
  if (!(await file.exists())) return null;
  return (await file.json()) as WowtbcExtract;
}

export const WOWTBC_MISSING = "no wowtbc extract — run: bun run src/forever.ts --ingest-wowtbc";

// --- Queries --------------------------------------------------------------

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Dungeon by slug or loose name ("Deadmines", "the-deadmines", "Scarlet Monastery - Armory"). */
export function findWowtbcDungeon(extract: WowtbcExtract, query: string): WowtbcDungeon | undefined {
  const needle = normalizeName(query);
  return Object.values(extract.dungeons).find(
    (d) => d.key === query.toLowerCase() || normalizeName(d.key) === needle || sameName(d.name, query),
  );
}

/** Word set, order-free: "Blackrock Spire: Lower" and "Lower Blackrock Spire" agree. */
function nameTokens(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && w !== "the")
    .sort()
    .join(" ");
}

/** Loose name equality shared with AtlasLoot instance/boss names. */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b) || nameTokens(a) === nameTokens(b);
}

/** Drop/quest sources for an item, each stamped with provenance. Empty = not in wowtbc's tables. */
export function findWowtbcSources(
  extract: WowtbcExtract,
  itemId: number,
): (WowtbcItemSource & { provenance: WowtbcProvenance; vanilla_drop_chance: number | null })[] {
  const item = extract.items[String(itemId)];
  if (!item) return [];
  return item.sources.map((s) => ({
    ...s,
    provenance: item.provenance,
    // A drop chance belongs to a drop, never to a quest reward.
    vanilla_drop_chance: s.kind === "quest" ? null : item.vanilla_drop_chance,
  }));
}
