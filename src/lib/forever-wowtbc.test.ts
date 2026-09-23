import { describe, expect, test } from "bun:test";
import {
  buildExtract,
  classifyContent,
  composeGapItem,
  findWowtbcDungeon,
  findWowtbcSources,
  sameName,
  WOWTBC_SOURCE,
  type DungeonPage,
  type WagoItemContext,
} from "./forever-wowtbc.ts";
import { projectItemsView, type ForeverCatalog } from "./forever.ts";

// Shapes below are trimmed verbatim from wowtbc.gg page-data (fetched 2026-09-23).

const hallOfThanes: DungeonPage = {
  link: { name: "Hall of Thanes", path: "/warcraftforever/loot-tables/dungeons/hall-of-thanes/", levels: [13, 18], isNew: true },
  url: "https://wowtbc.gg/page-data/warcraftforever/loot-tables/dungeons/hall-of-thanes/page-data.json",
  fetched_at: "2026-09-23T00:00:00.000Z",
  gear: [
    {
      id: 270227, name: "Ephemeral Choker", discovered: true, rarity: "rare", bind: "bop", slot: "neck", ilvl: 18,
      icon: "inv_misc_necklacea8", source: "Faldrim Anvilmar", source_type: "Hall of Thanes",
      // Upstream has no drop chance for new content; one is injected to prove it is never carried.
      drop_chance: 0.5,
      primary_stats: { stamina: 4, spirit: 2 }, other_stats: { min_level: 13 },
    },
    { id: 279894, name: "Incursion Reward", rarity: "uncommon", bind: "bop", slot: "feet", ilvl: 16, source: "Old Ironforge Incursion", source_type: "Quest" },
  ],
  loot: [
    {
      dungeon: "Hall of Thanes",
      bosses: [{ name: "Faldrim Anvilmar", items: [270227] }],
      quests: [{ name: "Old Ironforge Incursion", items: [279894], level: 9 }],
    },
  ],
};

const deadmines: DungeonPage = {
  link: { name: "The Deadmines", path: "/warcraftforever/loot-tables/dungeons/the-deadmines/", levels: [15, 25], isNew: false },
  url: "https://wowtbc.gg/page-data/warcraftforever/loot-tables/dungeons/the-deadmines/page-data.json",
  fetched_at: "2026-09-23T00:00:01.000Z",
  gear: [
    { id: 872, name: "Rockslicer", discovered: true, rarity: "rare", bind: "bop", slot: "two-hand", type: "axe", ilvl: 23, drop_chance: 0.0374, source: "Rhahk'Zor", source_type: "The Deadmines", primary_stats: { strength: 10 } },
    { id: 273289, name: "Ogre Loincloth", discovered: true, rarity: "rare", bind: "bop", slot: "legs", type: "cloth", ilvl: 22, source: "Rhahk'Zor", source_type: "The Deadmines", secondary_stats: { spell_damage: 6 } },
    { id: 10400, name: "Blackened Defias Leggings", rarity: "rare", bind: "bop", slot: "legs", ilvl: 19, drop_chance: 0.0338, source: "Trash drop", source_type: "The Deadmines" },
  ],
  loot: [
    {
      dungeon: "The Deadmines",
      bosses: [
        { name: "Rhahk'Zor", items: [872, 273289] },
        { name: "Trash", items: [10400] },
      ],
      quests: [],
    },
  ],
};

const shapersTerrace: DungeonPage = {
  link: { name: "Shaper's Terrace", path: "/warcraftforever/loot-tables/dungeons/shaper-s-terrace/", levels: [55, 60], isNew: true },
  url: "https://wowtbc.gg/page-data/warcraftforever/loot-tables/dungeons/shaper-s-terrace/page-data.json",
  fetched_at: "2026-09-23T00:00:02.000Z",
  gear: [],
  loot: [{ dungeon: "Shaper's Terrace", bosses: [] }],
};

const wago: WagoItemContext = {
  // 270227 and 10400 are in wago's `Item` table (no ItemSparse row); 273289 is not in it at all.
  items: new Map([
    ["270227", { ID: "270227", ClassID: "4", SubclassID: "0", InventoryType: "2", IconFileDataID: "999" }],
    ["10400", { ID: "10400", ClassID: "4", SubclassID: "2", InventoryType: "7", IconFileDataID: "0" }],
  ]),
  classNames: new Map([["4", "Armor"]]),
  subclassNames: new Map([["4/0", "Miscellaneous"], ["4/2", "Leather"]]),
  iconManifest: new Map([["999", { ID: "999", FileName: "Interface/Icons/INV_Wago_Icon.blp" }]]),
  inventoryTypes: { "2": "Neck", "7": "Legs" },
  qualities: { "2": "Uncommon", "3": "Rare" },
  bondings: { "1": "Bind On Acquire" },
  setsByItem: new Map(),
};

// 872 is a build item (has an ItemSparse row); the rest are gap items.
const extract = buildExtract([hallOfThanes, deadmines, shapersTerrace], new Set([872]), wago, "1.60.1.1", "now");

describe("wowtbc dungeon mapping", () => {
  test("maps bosses to items and models quests separately", () => {
    const hot = extract.dungeons["hall-of-thanes"]!;
    expect(hot.bosses["Faldrim Anvilmar"]!.item_ids).toEqual([270227]);
    expect(hot.quests).toEqual([
      { name: "Old Ironforge Incursion", level: 9, faction: null, item_ids: [279894], new_item_ids: [] },
    ]);
    expect(findWowtbcSources(extract, 279894).map((s) => s.kind)).toEqual(["quest"]);
  });

  test("upstream's Trash pseudo-boss is trash, not an encounter", () => {
    const dm = extract.dungeons["the-deadmines"]!;
    expect(Object.keys(dm.bosses)).toEqual(["Rhahk'Zor"]);
    expect(dm.trash).toEqual({ item_ids: [10400] });
    expect(findWowtbcSources(extract, 10400)).toMatchObject([{ kind: "trash", name: null }]);
  });

  test("a dungeon with no upstream data reads as unknown, nothing fabricated", () => {
    const st = extract.dungeons["shaper-s-terrace"]!;
    expect(st.status).toBe("unknown");
    expect(st.unknown.length).toBeGreaterThan(0);
    expect(st.bosses).toEqual({});
    expect(st.trash).toBeNull();
    expect(extract.meta.unknown_dungeons).toEqual(["Shaper's Terrace"]);
  });
});

describe("wowtbc provenance", () => {
  test("every item is stamped, and a missing discovered flag is null, not false", () => {
    for (const item of Object.values(extract.items)) {
      expect(item.provenance.source).toBe(WOWTBC_SOURCE);
      expect(item.provenance.fetched_at).toMatch(/^2026-09-23/);
    }
    expect(extract.items["270227"]!.provenance.discovered).toBe(true);
    expect(extract.items["10400"]!.provenance.discovered).toBeNull();
    expect(extract.meta.discovered).toEqual({ true: 3, false: 0, null: 2 });
  });

  test("drop chance is carried only for Vanilla content, never for new content", () => {
    expect(extract.items["872"]!.vanilla_drop_chance).toBe(0.0374);
    // New dungeon — even though upstream (here, injected) supplied a number.
    expect(extract.items["270227"]!.content).toBe("forever-new");
    expect(extract.items["270227"]!.vanilla_drop_chance).toBeNull();
    // New item in a reused dungeon.
    expect(extract.items["273289"]!.content).toBe("forever-new");
    expect(extract.items["273289"]!.vanilla_drop_chance).toBeNull();
  });

  test("a quest reward never carries a drop chance", () => {
    for (const s of findWowtbcSources(extract, 279894)) expect(s.vanilla_drop_chance).toBeNull();
  });

  test("content classification", () => {
    expect(classifyContent(872, false, false)).toBe("vanilla");
    expect(classifyContent(872, true, false)).toBe("forever-new");
    expect(classifyContent(872, false, true)).toBe("forever-new");
    expect(classifyContent(273289, false, false)).toBe("forever-new");
  });
});

describe("gap items", () => {
  test("only items without an ItemSparse row become gap items", () => {
    expect(Object.keys(extract.gap_items).sort()).toEqual(["10400", "270227", "273289", "279894"]);
    expect(extract.gap_items["872"]).toBeUndefined();
    expect(extract.meta.gap_items_by_content).toEqual({ vanilla: 1, "forever-new": 3 });
  });

  test("wago Item-table fields stay authoritative per field", () => {
    const gap = extract.gap_items["270227"]!;
    // wago's icon wins over wowtbc's, even though both exist.
    expect(gap.icon).toBe("inv_wago_icon");
    expect(gap.field_sources.icon).toBe("wago-item");
    expect(gap.item_class).toBe("Armor");
    expect(gap.inventory_type).toBe("Neck");
    expect(gap.field_sources.inventory_type).toBe("wago-item");
    // wago has no name/ilvl for it — wowtbc fills those.
    expect(gap.name).toBe("Ephemeral Choker");
    expect(gap.field_sources.name).toBe(WOWTBC_SOURCE);
    expect(gap.quality).toBe("Rare");
  });

  test("wowtbc fills a field wago has but leaves empty", () => {
    // IconFileDataID 0 = wago lacks an icon, so upstream's may fill it (none given here).
    const gap = extract.gap_items["10400"]!;
    expect(gap.icon).toBeNull();
    expect(gap.item_subclass).toBe("Leather");
    expect(gap.in_wago_item_table).toBe(true);
    expect(extract.gap_items["273289"]!.in_wago_item_table).toBe(false);
  });

  test("upstream stat names stay raw and never appear as build-computed stats", () => {
    const gap = composeGapItem(extract.items["273289"]!, wago);
    expect(gap.upstream_stats).toEqual({ secondary: { spell_damage: 6 } });
    expect(gap).not.toHaveProperty("stats");
    expect(gap).not.toHaveProperty("armor");
    expect(gap).not.toHaveProperty("weapon");
  });
});

describe("items view with wowtbc", () => {
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
  const view = projectItemsView(catalog, extract);

  test("gap items join the view, flagged with their data source", () => {
    const gap = view.items.find((i) => i.id === 270227)!;
    expect(gap.data_source).toBe(WOWTBC_SOURCE);
    expect(gap).not.toHaveProperty("stats");
    expect(gap.upstream_stats?.primary).toEqual({ stamina: 4, spirit: 2 });
    expect(view.meta.gap_item_count).toBe(4);
  });

  test("build rows keep build data and gain only a stamped drop source", () => {
    const row = view.items.find((i) => i.id === 872)!;
    expect(row).not.toHaveProperty("data_source");
    // Every stamped source carries all three provenance fields, not just `source`.
    expect(row.drop_sources).toEqual([{
      dungeon_key: "the-deadmines", dungeon: "The Deadmines", kind: "boss", name: "Rhahk'Zor", source: WOWTBC_SOURCE,
      discovered: true, fetched_at: "2026-09-23T00:00:01.000Z",
    }]);
  });

  test("a missing upstream discovered flag stays null on view sources", () => {
    const row = view.items.find((i) => i.id === 10400)!;
    expect(row.drop_sources![0]!.discovered).toBeNull();
    expect(row.drop_sources![0]!.fetched_at).toBe("2026-09-23T00:00:01.000Z");
  });

  test("an unknown upstream item level is null, never 0", () => {
    // 279894 has an ilvl but no min_level upstream.
    const row = view.items.find((i) => i.id === 279894)!;
    expect(row.item_level).toBe(16);
    expect(row.required_level).toBeNull();
  });
});

describe("an item listed in more than one dungeon", () => {
  // 872 appears first in a reused dungeon (with a drop chance), then in a new one.
  const newDungeon: DungeonPage = {
    ...hallOfThanes,
    link: { ...hallOfThanes.link, name: "New Place", path: "/warcraftforever/loot-tables/dungeons/new-place/" },
    gear: [{ id: 872, name: "Rockslicer", rarity: "rare", ilvl: 23, drop_chance: 0.1 }],
    loot: [{ dungeon: "New Place", bosses: [{ name: "Someone", items: [872] }] }],
  };
  const merged = buildExtract([deadmines, newDungeon], new Set(), wago, "1.60.1.1", "now");

  test("is new if any listing says so, and loses its Vanilla drop chance", () => {
    expect(merged.items["872"]!.content).toBe("forever-new");
    expect(merged.items["872"]!.vanilla_drop_chance).toBeNull();
    expect(merged.items["872"]!.sources.map((s) => s.dungeon_key)).toEqual(["the-deadmines", "new-place"]);
  });
});

describe("name matching", () => {
  test("tolerates AtlasLoot's naming differences", () => {
    expect(sameName("Blackrock Spire: Lower", "Lower Blackrock Spire")).toBe(true);
    expect(sameName("Hall of Thanes", "The Hall of Thanes")).toBe(true);
    expect(sameName("Scarlet Monastery: Armory", "Scarlet Monastery - Armory")).toBe(true);
    expect(sameName("Dire Maul: East", "Dire Maul West")).toBe(false);
  });

  test("finds a dungeon by loose name or slug", () => {
    expect(findWowtbcDungeon(extract, "Deadmines")?.key).toBe("the-deadmines");
    expect(findWowtbcDungeon(extract, "shaper-s-terrace")?.name).toBe("Shaper's Terrace");
  });
});
