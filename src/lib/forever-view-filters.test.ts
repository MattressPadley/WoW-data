// Tests for the item browser's instance index (src/lib/forever.ts) and the
// widget's pure search/facet functions. The latter live in .tome/widgets/lib/,
// but their tests cannot: tome builds every non-`_` file there for the browser.

import { describe, expect, test } from "bun:test";
import { buildExtract, WOWTBC_MISSING, WOWTBC_SOURCE, type DungeonPage, type WagoItemContext } from "./forever-wowtbc.ts";
import {
  instanceIndex,
  mergeInstances,
  projectItemsView,
  ATLASLOOT_MISSING,
  ATLASLOOT_SOURCE,
  type ForeverCatalog,
  type LootBoss,
  type LootExtract,
  type LootInstance,
} from "./forever.ts";
import {
  buildDropIndex,
  facetItemIds,
  facetOptionLabel,
  facetOptions,
  matchesQuery,
  sourceLabel,
  type InstanceEntry,
} from "../../.tome/widgets/lib/forever-filters.ts";

// --- Fixtures -------------------------------------------------------------

const page = (name: string, slug: string, isNew: boolean, fetched: string, loot: DungeonPage["loot"], ids: number[]): DungeonPage => ({
  link: { name, path: `/warcraftforever/loot-tables/dungeons/${slug}/`, levels: [10, 20], isNew },
  url: `https://wowtbc.gg/page-data/warcraftforever/loot-tables/dungeons/${slug}/page-data.json`,
  fetched_at: fetched,
  gear: ids.map((id) => ({ id, name: `Item ${id}`, rarity: "rare", ilvl: 18 })),
  loot,
});

// wowtbc names it "Hall of Thanes"; AtlasLoot (below) says "The Hall of Thanes".
const hallOfThanes = page("Hall of Thanes", "hall-of-thanes", true, "2026-09-23T00:00:00.000Z", [{
  dungeon: "Hall of Thanes",
  bosses: [
    { name: "Faldrim Anvilmar", items: [270227, 271096, 271097] },
    { name: "Magmatus", items: [270230] },
  ],
  quests: [{ name: "Old Ironforge Incursion", items: [279894] }],
}], [270227, 271096, 271097, 270230, 279894]);

const deadmines = page("The Deadmines", "the-deadmines", false, "2026-09-23T00:00:01.000Z", [{
  dungeon: "The Deadmines",
  bosses: [
    { name: "Rhahk'Zor", items: [872] },
    { name: "Trash", items: [10400, 10401] },
  ],
  quests: [{ name: "Red Silk Bandanas", items: [10402] }, { name: "Red Silk Bandanas", items: [10403] }],
}], [872, 10400, 10401, 10402, 10403]);

const shapersTerrace = page("Shaper's Terrace", "shaper-s-terrace", true, "2026-09-23T00:00:02.000Z", [{ dungeon: "Shaper's Terrace", bosses: [] }], []);

const wago: WagoItemContext = {
  items: new Map(), classNames: new Map(), subclassNames: new Map(), iconManifest: new Map(),
  inventoryTypes: {}, qualities: { "3": "Rare" }, bondings: {}, setsByItem: new Map(),
};

const wowtbc = buildExtract([hallOfThanes, deadmines, shapersTerrace], new Set([872]), wago, "1.60.1.1", "now");

const boss = (name: string, status: LootBoss["loot_status"] = "known-vanilla", mapBossId: number | null = 1): LootBoss => ({
  name, npc_id: null, loot_status: status, atlas_map_boss_id: mapBossId, difficulties: {}, drop_rates: null, unknown: [],
});
const instance = (key: string, name: string, contentType: string, provenance: LootInstance["provenance"], bosses: LootBoss[]): LootInstance => ({
  key, name, area_name: null, content_type: contentType, map_id: null, instance_id: null, level_range: null, provenance, bosses, unknown: [],
});

const loot: LootExtract = {
  meta: {
    generated_at: "now", generator: "test",
    upstream: { repo: "AtlasLootClassic", commit: "abc123", paths: [], license: "GPL" },
    instance_count: 4, boss_count: 0, known_vanilla_boss_count: 0, unknown_new_content_boss_count: 0, notes: [],
  },
  instances: [
    instance("HallofThanes", "The Hall of Thanes", "Dungeons", "forever-new", [
      boss("Faldrim Anvilmar", "unknown-new-content"),
      boss("Magmatus", "unknown-new-content"),
      boss("Plunder", "unknown-new-content"),
    ]),
    instance("TheDeadmines", "The Deadmines", "Dungeons", "vanilla", [
      boss("Rhahk'Zor"), boss("Marisa du'Paige"), boss("Trash Mobs", "known-vanilla", null), boss("Keys", "known-vanilla", null),
    ]),
    instance("CityofDalaran", "City of Dalaran", "Dungeons", "forever-new", [boss("Archmage A", "unknown-new-content")]),
    instance("MoltenCore", "Molten Core", "40 Raids", "vanilla", [boss("Lucifron")]),
  ],
};

const catalog = {
  meta: { build: "1.60.1.1", ingested_at: "now" } as ForeverCatalog["meta"],
  items: [{
    id: 872, name: "Rockslicer", item_level: 23, required_level: 18, quality_id: 3, quality: "Rare",
    inventory_type_id: 17, inventory_type: "Two-Hand", class_id: 2, subclass_id: 1, item_class: "Weapon",
    item_subclass: "Axe", icon: null, bonding: 1, binding: "Bind On Acquire", flavor: null,
    allowable_classes: null, allowable_races: null, armor: null, weapon: null, sell_price: 0, buy_price: 0,
    sockets: [], budget: null, stats: [], effects: [], item_set: null,
  }],
  item_sets: [], zones: [], maps: [],
} as ForeverCatalog;

const view = projectItemsView(catalog, wowtbc, loot);
const byKey = (key: string) => view.meta.instances.find((i) => i.key === key)!;
const dropIndex = buildDropIndex(view.items);
const ids = (key: string, value: string) => [...facetItemIds(dropIndex, key, value)!].sort((a, b) => a - b);

// --- Instance merge (shared with --list-instances) ------------------------

describe("mergeInstances", () => {
  test("pairs across naming differences, AtlasLoot order first, then wowtbc-only", () => {
    const merged = mergeInstances(loot, wowtbc);
    expect(merged.map((m) => [m.atlasloot?.key ?? null, m.wowtbc?.key ?? null])).toEqual([
      ["HallofThanes", "hall-of-thanes"],
      ["TheDeadmines", "the-deadmines"],
      ["CityofDalaran", null],
      ["MoltenCore", null],
      [null, "shaper-s-terrace"],
    ]);
  });

  test("degrades to either side alone", () => {
    expect(mergeInstances(null, wowtbc).every((m) => m.atlasloot === null && m.wowtbc)).toBe(true);
    expect(mergeInstances(loot, null).every((m) => m.wowtbc === null && m.atlasloot)).toBe(true);
  });
});

// --- Instance index -------------------------------------------------------

describe("instance index on the view meta", () => {
  test("carries the wowtbc key, with AtlasLoot's display name where both list it", () => {
    const hot = byKey("hall-of-thanes");
    expect(hot.name).toBe("The Hall of Thanes");
    expect(hot).toMatchObject({ kind: "dungeon", is_new: true, status: "listed", unknown: [] });
  });

  test("drop sources carry the same key, so the join never depends on a name", () => {
    const row = view.items.find((i) => i.id === 270227)!;
    expect(row.drop_sources![0]).toMatchObject({ dungeon_key: "hall-of-thanes", dungeon: "Hall of Thanes" });
    // The names really do differ — an exact name join would find nothing.
    expect(row.drop_sources![0]!.dungeon).not.toBe(byKey("hall-of-thanes").name);
  });

  test("bosses: wowtbc-resolvable are listed under wowtbc's name, AtlasLoot-only are unknown", () => {
    expect(byKey("hall-of-thanes").bosses.map((b) => [b.name, b.status])).toEqual([
      ["Faldrim Anvilmar", "listed"],
      ["Magmatus", "listed"],
      ["Plunder", "unknown"],
    ]);
    expect(byKey("hall-of-thanes").bosses[2]!.unknown).toMatch(/only in the AtlasLoot extract/);
  });

  test("Shaper's Terrace is unknown with no bosses, never empty-and-complete", () => {
    const st = byKey("shaper-s-terrace");
    expect(st).toMatchObject({ status: "unknown", bosses: [], has_trash: false, quests: [] });
    expect(st.unknown[0]).toMatch(/unknown, not empty/);
  });

  test("an AtlasLoot-only dungeon and a raid list their bosses as unknown", () => {
    const dal = byKey("CityofDalaran");
    expect(dal).toMatchObject({ status: "unknown", kind: "dungeon", is_new: true });
    expect(dal.bosses.every((b) => b.status === "unknown" && b.unknown)).toBe(true);
    const mc = byKey("MoltenCore");
    expect(mc).toMatchObject({ status: "unknown", kind: "raid" });
    expect(mc.bosses).toEqual([{ name: "Lucifron", status: "unknown", unknown: expect.stringMatching(/raids deferred/) }]);
  });

  test("AtlasLoot loot groupings (no npc id, no map boss id) are not bosses", () => {
    expect(byKey("the-deadmines").bosses.map((b) => b.name)).toEqual(["Rhahk'Zor", "Marisa du'Paige"]);
  });

  test("Deadmines has trash and deduplicated quests", () => {
    const dm = byKey("the-deadmines");
    expect(dm.has_trash).toBe(true);
    expect(dm.quests).toEqual(["Red Silk Bandanas"]);
  });

  test("every instance source is stamped", () => {
    for (const entry of view.meta.instances) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const s of entry.sources) {
        if (s.source === WOWTBC_SOURCE) expect(s.fetched_at).toBeTruthy();
        else expect(s).toEqual({ source: ATLASLOOT_SOURCE, upstream_commit: "abc123" });
      }
    }
    expect(byKey("hall-of-thanes").sources.map((s) => s.source)).toEqual([ATLASLOOT_SOURCE, WOWTBC_SOURCE]);
  });

  test("a missing AtlasLoot extract degrades to wowtbc dungeons, not a failed projection", () => {
    const degraded = projectItemsView(catalog, wowtbc, null);
    expect(degraded.meta.instances.map((i) => i.key)).toEqual(["hall-of-thanes", "the-deadmines", "shaper-s-terrace"]);
    expect(degraded.meta.atlasloot_missing).toBe(ATLASLOOT_MISSING);
    expect(degraded.meta).not.toHaveProperty("wowtbc_missing");
  });

  test("no wowtbc extract: every instance unknown, with the ingest hint", () => {
    const bare = projectItemsView(catalog, null, loot);
    expect(bare.meta.wowtbc_fetched_at).toBeNull();
    expect(bare.meta.wowtbc_missing).toBe(WOWTBC_MISSING);
    expect(bare.meta.instances.every((i) => i.status === "unknown" && i.unknown[0] === WOWTBC_MISSING)).toBe(true);
    expect(bare.meta.instances.flatMap((i) => i.bosses).every((b) => b.status === "unknown")).toBe(true);
  });

  test("nothing at all yields an empty index plus both reasons", () => {
    const none = projectItemsView(catalog, null, null);
    expect(none.meta.instances).toEqual([]);
    expect(none.meta.wowtbc_missing).toBe(WOWTBC_MISSING);
    expect(none.meta.atlasloot_missing).toBe(ATLASLOOT_MISSING);
  });

  test("instanceIndex matches what the view emits", () => {
    expect(instanceIndex(loot, wowtbc)).toEqual(view.meta.instances);
  });
});

// --- Widget search --------------------------------------------------------

describe("matchesQuery", () => {
  const item = { id: 12640, name: "Lionheart Helm" };

  test("all-digit input matches the id exactly, never as a substring", () => {
    expect(matchesQuery(item, "12640")).toBe(true);
    expect(matchesQuery(item, " 12640 ")).toBe(true);
    expect(matchesQuery(item, "1264")).toBe(false);
    expect(matchesQuery({ id: 126400, name: "x" }, "12640")).toBe(false);
  });

  test("anything else is a case-insensitive name substring", () => {
    expect(matchesQuery(item, "lionheart")).toBe(true);
    expect(matchesQuery(item, "HELM")).toBe(true);
    expect(matchesQuery(item, "sword")).toBe(false);
    expect(matchesQuery({ id: 1, name: "Pendant 2" }, "pendant 2")).toBe(true);
  });

  test("empty input matches everything", () => {
    expect(matchesQuery(item, "  ")).toBe(true);
  });
});

// --- Widget facet ---------------------------------------------------------

describe("instance → boss facet over the view rows", () => {
  test("Faldrim Anvilmar resolves to exactly its items, joined on the key", () => {
    expect(ids("hall-of-thanes", "boss|Faldrim Anvilmar")).toEqual([270227, 271096, 271097]);
    // A display-name key resolves nothing — the index is keyed on wowtbc slugs only.
    expect(dropIndex.has("The Hall of Thanes|boss|Faldrim Anvilmar")).toBe(false);
    expect(dropIndex.has("Hall of Thanes|boss|Faldrim Anvilmar")).toBe(false);
  });

  test("trash is its own value, never a boss", () => {
    expect(ids("the-deadmines", "trash|")).toEqual([10400, 10401]);
    const options = facetOptions(byKey("the-deadmines") as InstanceEntry, dropIndex);
    expect(options.filter((o) => o.kind === "boss").map((o) => o.label)).toEqual(["Rhahk'Zor", "Marisa du'Paige"]);
    expect(options.find((o) => o.kind === "trash")).toMatchObject({ label: "Trash", count: 2 });
  });

  test("all drops and all quests roll up per instance", () => {
    expect(ids("the-deadmines", "all|")).toEqual([872, 10400, 10401, 10402, 10403]);
    expect(ids("the-deadmines", "quests|")).toEqual([10402, 10403]);
    expect(ids("the-deadmines", "quest|Red Silk Bandanas")).toEqual([10402, 10403]);
  });

  test("an AtlasLoot-only boss selects as unknown with its reason, never zero-and-complete", () => {
    const marisa = facetOptions(byKey("the-deadmines") as InstanceEntry, dropIndex).find((o) => o.label === "Marisa du'Paige")!;
    expect(marisa.count).toBe(0);
    expect(marisa.unknown).toMatch(/only in the AtlasLoot extract/);
    expect(facetOptionLabel(marisa)).toBe("Marisa du'Paige — unknown");
    expect(ids("the-deadmines", "boss|Marisa du'Paige")).toEqual([]);
  });

  test("an unknown dungeon's options are all unknown", () => {
    const options = facetOptions(byKey("shaper-s-terrace") as InstanceEntry, dropIndex);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ kind: "all", count: 0 });
    expect(options[0]!.unknown).toMatch(/unknown, not empty/);
    const mc = facetOptions(byKey("MoltenCore") as InstanceEntry, dropIndex);
    expect(mc.every((o) => o.unknown)).toBe(true);
  });

  test("no instance picked means no facet filter", () => {
    expect(facetItemIds(dropIndex, null, "all|")).toBeNull();
  });

  test("both loot sources are labelled datamined", () => {
    expect(sourceLabel(WOWTBC_SOURCE)).toMatch(/datamined/);
    expect(sourceLabel(ATLASLOOT_SOURCE)).toMatch(/datamined/);
  });
});
