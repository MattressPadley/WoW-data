import { describe, expect, test } from "bun:test";
import {
  computeArmor,
  computeItemStats,
  computeStatValue,
  computeWeapon,
  decodeAllowMask,
  loadEnums,
  projectItemsView,
  resolveDamageCurve,
  resolveIconName,
  resolveStatBudget,
  stripSpellTokens,
  type ArmorContext,
  type ForeverCatalog,
  type ForeverItem,
  type StatContext,
  type WeaponContext,
} from "./forever.ts";
import type { Row as CsvRow } from "./wago.ts";

const enums = await loadEnums();

// RandPropPoints rows for the item levels exercised below, verbatim from the
// Forever build's DB2 export.

const randPropPoints = new Map<string, CsvRow>([
  ["61", rpp("61", { EpicF_0: "45", EpicF_1: "34", EpicF_2: "25", EpicF_3: "19", EpicF_4: "14", SuperiorF_0: "35", GoodF_0: "27" })],
  ["20", rpp("20", { EpicF_0: "7", GoodF_1: "5", SuperiorF_1: "6" })],
]);

function rpp(id: string, cols: Record<string, string>): CsvRow {
  return { ID: id, ...cols };
}

const ctx: StatContext = { randPropPoints, enums };

describe("ItemStatType enum snapshot", () => {
  test("is captured from wago DBD metadata, not hardcoded", () => {
    expect(enums.statType.source).toContain("dbdMeta.enums");
    expect(enums.statType.build).toMatch(/^1\.60\.1\./);
  });

  test("carries the stat ids the budget maths relies on", () => {
    expect(enums.statType.values["4"]).toBe("STRENGTH");
    expect(enums.statType.values["7"]).toBe("STAMINA");
    expect(enums.statType.values["31"]).toBe("HIT_RATING");
    expect(enums.statType.values["32"]).toBe("CRIT_RATING");
  });
});

describe("computeStatValue", () => {
  test("applies the item budget formula", () => {
    expect(computeStatValue(4000, 45)).toBe(18);
    expect(computeStatValue(6222, 45)).toBe(28);
    expect(computeStatValue(4444, 45)).toBe(20);
  });

  test("rounds halves up, matching the engine", () => {
    expect(computeStatValue(7000, 5)).toBe(4); // 3.5
    expect(computeStatValue(5000, 25)).toBe(13); // 12.5
  });
});

describe("resolveStatBudget", () => {
  test("resolves an epic head slot to the Epic band, slot group 0", () => {
    const res = resolveStatBudget(61, 4, 1, ctx);
    expect(res.budget).toEqual({
      item_level: 61,
      quality: "Epic",
      band: "Epic",
      slot: "Head",
      slot_group: 0,
      points: 45,
    });
  });

  test("groups finger with the low-budget slots", () => {
    expect(resolveStatBudget(61, 4, 11, ctx).budget?.slot_group).toBe(2);
  });

  test("reports common/poor items as budget-less rather than guessing", () => {
    const res = resolveStatBudget(61, 1, 1, ctx);
    expect(res.budget).toBeNull();
    expect(res).toHaveProperty("unknown");
  });

  test("reports an unknown item level instead of falling back to another row", () => {
    const res = resolveStatBudget(999, 4, 1, ctx);
    expect(res.budget).toBeNull();
    expect((res as { unknown: string }).unknown).toContain("999");
  });

  test("reports non-equippable slots as budget-less", () => {
    expect(resolveStatBudget(61, 4, 0, ctx).budget).toBeNull();
  });
});

describe("computeItemStats", () => {
  // Lionheart Helm (12640) as shipped in the Forever build.
  const lionheart: CsvRow = {
    StatModifier_bonusStat_0: "4",
    StatPercentEditor_0: "4000",
    StatModifier_bonusStat_1: "32",
    StatPercentEditor_1: "6222",
    StatModifier_bonusStat_2: "31",
    StatPercentEditor_2: "4444",
    ...Object.fromEntries(
      [3, 4, 5, 6, 7, 8, 9].flatMap((i) => [
        [`StatModifier_bonusStat_${i}`, "-1"],
        [`StatPercentEditor_${i}`, "0"],
      ]),
    ),
  };
  test("computes Lionheart Helm's real stat line", () => {
    const res = resolveStatBudget(61, 4, 1, ctx);
    const stats = computeItemStats(lionheart, res.budget, null, enums);
    expect(stats).toEqual([
      { stat: "STRENGTH", stat_id: 4, allocation: 4000, value: 18 },
      { stat: "CRIT_RATING", stat_id: 32, allocation: 6222, value: 28 },
      { stat: "HIT_RATING", stat_id: 31, allocation: 4444, value: 20 },
    ]);
  });

  test("marks values explicitly unknown when no budget resolved", () => {
    const stats = computeItemStats(lionheart, null, "no RandPropPoints row for item level 999", enums);
    expect(stats.every((s) => s.value === null)).toBe(true);
    expect(stats[0]!.unknown).toContain("999");
    expect(stats[0]!.stat).toBe("STRENGTH");
  });

  test("skips empty stat slots", () => {
    const stats = computeItemStats({ StatModifier_bonusStat_0: "-1", StatPercentEditor_0: "0" }, null, "x", enums);
    expect(stats).toHaveLength(0);
  });

  test("keeps the stat id when the enum has no name for it", () => {
    const stats = computeItemStats(
      { StatModifier_bonusStat_0: "9999", StatPercentEditor_0: "4000" },
      { item_level: 61, quality: "Epic", band: "Epic", slot: "Head", slot_group: 0, points: 45 },
      null,
      enums,
    );
    expect(stats[0]).toEqual({ stat: null, stat_id: 9999, allocation: 4000, value: 18 });
  });
});

// --- Display enrichment ---------------------------------------------------

describe("resolveIconName", () => {
  const manifest = new Map<string, CsvRow>([
    ["134168", { ID: "134168", FilePath: "Interface\\Icons\\", FileName: "INV_Helmet_36.blp" }],
  ]);

  test("stores the lowercased base name, never a path or a URL", () => {
    expect(resolveIconName(134168, manifest)).toBe("inv_helmet_36");
  });

  test("reports an unassigned or unknown icon id as null", () => {
    expect(resolveIconName(0, manifest)).toBeNull();
    expect(resolveIconName(999999, manifest)).toBeNull();
  });
});

describe("stripSpellTokens", () => {
  test("removes value and duration placeholders without inventing numbers", () => {
    expect(stripSpellTokens("Increases Strength by $s1 for $d.")).toBe("Increases Strength by for.");
    expect(stripSpellTokens("Smites an enemy for $s1 Holy damage.")).toBe("Smites an enemy for Holy damage.");
  });

  test("removes the percent sign stranded by its number", () => {
    expect(stripSpellTokens("Increases ranged attack speed by $s1%.")).toBe("Increases ranged attack speed by.");
  });

  test("peels nested maths blocks and named variables", () => {
    expect(stripSpellTokens("Causes ${$*$<frostdamage>} to ${*$<frostdamage>} Frost damage.")).toBe(
      "Causes to Frost damage.",
    );
  });

  test("removes cross-spell references and conditionals", () => {
    expect(stripSpellTokens("$@spelldesc434 Well fed.")).toBe("Well fed.");
    expect(stripSpellTokens("$?a123[Empowered][Normal] strike.")).toBe("strike.");
  });

  test("never leaves a $ token behind", () => {
    const samples = [
      "Poisons target for $s1 Nature damage every $t1 sec for $d.",
      "Coats a weapon with poison that lasts for ${/60} minutes.",
      "Converts health into ${(+*1)*(1+/100)} Mana for you.",
    ];
    for (const sample of samples) expect(stripSpellTokens(sample)).not.toContain("$");
  });
});

describe("decodeAllowMask", () => {
  const classes = new Map([[1, "Warrior"], [2, "Paladin"], [3, "Hunter"], [4, "Rogue"]]);

  test("names the set bits", () => {
    expect(decodeAllowMask(0b0101n, classes)).toEqual(["Warrior", "Hunter"]);
  });

  test("treats an unset or all-set mask as no restriction", () => {
    expect(decodeAllowMask(0n, classes)).toBeNull();
    expect(decodeAllowMask(0b1111n, classes)).toBeNull();
  });
});

// --- Armor ----------------------------------------------------------------
//
// Rows verbatim from the Forever build's DB2 export. The expected values are
// Blizzard's own, read off the Classic Era item API for the same item ids, so
// these tests fail if the derivation drifts away from what the client shows.

const armorCtx: ArmorContext = {
  armorTotal: new Map<string, CsvRow>([
    ["61", { ID: "61", ItemLevel: "61", Cloth: "491.89001464844", Leather: "974.80999755859", Mail: "2044.9899902344", Plate: "3619.3100585938" }],
    ["62", { ID: "62", ItemLevel: "62", Cloth: "499.32998657227", Leather: "989.23999023438", Mail: "2074.7700195312", Plate: "3675.5400390625" }],
  ]),
  armorQuality: new Map<string, CsvRow>([
    ["61", { ID: "61", Qualitymod_3: "1.10000002384", Qualitymod_4: "1.20000004768" }],
    ["62", { ID: "62", Qualitymod_3: "1.10000002384", Qualitymod_4: "1.20000004768" }],
  ]),
  armorShield: new Map<string, CsvRow>([
    ["61", { ID: "61", ItemLevel: "61", Quality_3: "2089", Quality_4: "2327" }],
  ]),
  armorLocation: new Map<string, CsvRow>([
    ["1", { ID: "1", Clothmodifier: "0.12999999523", Leathermodifier: "0.12999999523", Chainmodifier: "0.12999999523", Platemodifier: "0.12999999523", Modifier: "0.11999999732" }],
    ["5", { ID: "5", Clothmodifier: "0.15999999642", Leathermodifier: "0.15999999642", Chainmodifier: "0.15999999642", Platemodifier: "0.15999999642", Modifier: "0.15999999642" }],
    // The robe synonym slot ships all-zero, exactly as the build does.
    ["20", { ID: "20", Clothmodifier: "0", Leathermodifier: "0", Chainmodifier: "0", Platemodifier: "0", Modifier: "0" }],
    ["19", { ID: "19", Clothmodifier: "0", Leathermodifier: "0", Chainmodifier: "0", Platemodifier: "0", Modifier: "0" }],
  ]),
  enums,
};

describe("computeArmor", () => {
  test("derives a plate head at the slot's own multiplier", () => {
    // 12640 Lionheart Helm, ilvl 61 Epic Head — Blizzard reports 565.
    expect(computeArmor("Armor", "Plate", 61, 4, 1, armorCtx)).toEqual({ armor: 565 });
  });

  test("falls back to the canonical slot id for a robe", () => {
    // 14152 Robe of the Archmage sits in InventoryType 20, whose ArmorLocation
    // row is all-zero; 5 shares its enum name. Blizzard reports 96.
    expect(computeArmor("Armor", "Cloth", 62, 4, 20, armorCtx)).toEqual({ armor: 96 });
  });

  test("reads shields straight off ItemArmorShield", () => {
    expect(computeArmor("Armor", "Shield", 61, 4, 14, armorCtx)).toEqual({ armor: 2327 });
  });

  test("reports no armor — without an unknown — for slots that wear none", () => {
    expect(computeArmor("Armor", "Cloth", 61, 4, 19, armorCtx)).toEqual({ armor: null });
    expect(computeArmor("Armor", "Miscellaneous", 61, 4, 11, armorCtx)).toEqual({ armor: null });
    expect(computeArmor("Weapon", "Sword", 61, 4, 13, armorCtx)).toEqual({ armor: null });
  });

  test("says why, rather than guessing, when a curve row is missing", () => {
    const result = computeArmor("Armor", "Plate", 999, 4, 1, armorCtx);
    expect(result.armor).toBeNull();
    expect((result as { unknown: string }).unknown).toContain("ItemArmorTotal");
  });
});

// --- Weapon damage --------------------------------------------------------

const weaponCtx: WeaponContext = {
  damageCurves: new Map([
    ["ItemDamageOneHand", new Map<string, CsvRow>([["78", { ItemLevel: "78", Quality_4: "59.61270523071" }]])],
    ["ItemDamageTwoHand", new Map<string, CsvRow>([["75", { ItemLevel: "75", Quality_4: "73.41432189941" }]])],
    ["ItemDamageWand", new Map<string, CsvRow>([["21", { ItemLevel: "21", Quality_2: "16.05131340027" }]])],
    ["ItemDamageOneHandCaster", new Map<string, CsvRow>([["78", { ItemLevel: "78", Quality_4: "59.61270523071" }]])],
  ]),
  enums,
};

describe("resolveDamageCurve", () => {
  test("picks the wand and thrown curves by subclass, before the slot", () => {
    // Wands and thrown weapons both occupy a Ranged inventory slot (26/25).
    expect(resolveDamageCurve("Wand", 26, 0, enums)).toBe("ItemDamageWand");
    expect(resolveDamageCurve("Thrown", 25, 0, enums)).toBe("ItemDamageThrown");
  });

  test("picks the ranged curve for bows, guns and crossbows", () => {
    expect(resolveDamageCurve("Gun", 26, 0, enums)).toBe("ItemDamageRanged");
  });

  test("splits one- and two-handed weapons by slot", () => {
    expect(resolveDamageCurve("Sword", 13, 0, enums)).toBe("ItemDamageOneHand");
    expect(resolveDamageCurve("Staff", 17, 0, enums)).toBe("ItemDamageTwoHand");
  });

  test("routes flagged caster weapons to the caster curves", () => {
    expect(resolveDamageCurve("Dagger", 13, 0x200, enums)).toBe("ItemDamageOneHandCaster");
    expect(resolveDamageCurve("Staff", 17, 0x200, enums)).toBe("ItemDamageTwoHandCaster");
  });

  test("reports an unknown slot rather than defaulting to a curve", () => {
    expect(resolveDamageCurve("Sword", 999, 0, enums)).toBeNull();
  });
});

describe("computeWeapon", () => {
  const weaponRow = (over: CsvRow): CsvRow => ({ DmgVariance: "0.4", DamageType: "0", ...over });

  test("matches Blizzard's damage range and DPS for a one-hander", () => {
    // 12584 Grand Marshal's Longsword — Blizzard reports 138-207, 59.5 dps.
    const result = computeWeapon("Weapon", "Sword", weaponRow({ ItemDelay: "2900" }), 78, 4, 13, weaponCtx);
    expect(result.weapon).toMatchObject({
      damage_curve: "ItemDamageOneHand",
      speed: 2.9,
      min_damage: 138,
      max_damage: 207,
      dps: 59.5,
    });
  });

  test("matches Blizzard's numbers for a two-handed caster staff", () => {
    // 18608 Benediction — Blizzard reports 176-264, 73.3 dps.
    const result = computeWeapon("Weapon", "Staff", weaponRow({ ItemDelay: "3000" }), 75, 4, 17, weaponCtx);
    expect(result.weapon).toMatchObject({ damage_curve: "ItemDamageTwoHand", min_damage: 176, max_damage: 264, dps: 73.3 });
  });

  test("matches Blizzard's numbers for a wand, off the wand curve", () => {
    // 5240 Torchlight Wand — Blizzard reports 14-27, 15.8 dps.
    const result = computeWeapon(
      "Weapon",
      "Wand",
      weaponRow({ ItemDelay: "1300", DmgVariance: "0.6", DamageType: "2" }),
      21,
      2,
      26,
      weaponCtx,
    );
    expect(result.weapon).toMatchObject({ damage_curve: "ItemDamageWand", min_damage: 14, max_damage: 27, dps: 15.8 });
  });

  test("keeps the damage type as a raw id, never a guessed school name", () => {
    const result = computeWeapon("Weapon", "Wand", weaponRow({ ItemDelay: "1300", DamageType: "2" }), 21, 2, 26, weaponCtx);
    expect(result.weapon?.damage_type_id).toBe(2);
  });

  test("returns nothing for non-weapons, and a reason when a curve row is missing", () => {
    expect(computeWeapon("Armor", "Plate", weaponRow({ ItemDelay: "0" }), 61, 4, 1, weaponCtx)).toEqual({ weapon: null });
    const result = computeWeapon("Weapon", "Sword", weaponRow({ ItemDelay: "2900" }), 999, 4, 13, weaponCtx);
    expect(result.weapon).toBeNull();
    expect((result as { unknown: string }).unknown).toContain("ItemDamageOneHand");
  });
});

// --- Projected view -------------------------------------------------------

describe("projectItemsView", () => {
  const item = (over: Partial<ForeverItem>): ForeverItem => ({
    id: 1, name: "Test", item_level: 10, required_level: 5, quality_id: 4, quality: "Epic",
    inventory_type_id: 1, inventory_type: "Head", class_id: 4, subclass_id: 4,
    item_class: "Armor", item_subclass: "Plate", icon: "inv_helmet_36",
    bonding: 1, binding: "Bind On Acquire", flavor: null,
    allowable_classes: null, allowable_races: null,
    armor: 565, weapon: null, sell_price: 1, buy_price: 2,
    sockets: [], budget: null, stats: [], effects: [], item_set: null,
    ...over,
  });
  const project = (over: Partial<ForeverItem>) =>
    projectItemsView({
      meta: { build: "1.60.1.1", ingested_at: "now" } as ForeverCatalog["meta"],
      items: [item(over)], item_sets: [], zones: [], maps: [],
    }).items[0]!;

  test("drops the human-invisible internals", () => {
    const row = project({ budget: { item_level: 10, quality: "Epic", band: "Epic", slot: "Head", slot_group: 0, points: 45 } });
    for (const key of ["budget", "quality_id", "inventory_type_id", "sell_price", "buy_price", "class_id", "subclass_id"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  test("omits absent fields instead of emitting nulls", () => {
    const row = project({ icon: null, flavor: null, armor: null, weapon: null, item_set: null });
    for (const key of ["icon", "flavor", "armor", "weapon", "item_set", "sockets", "stats", "effects"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  test("omits the binding line for an unbound item", () => {
    expect(project({ bonding: 0, binding: "Not Bound" })).not.toHaveProperty("binding");
    expect(project({ bonding: 2, binding: "Bind On Equip" }).binding).toBe("Bind On Equip");
  });

  test("keeps the reason an armor or damage value is missing", () => {
    const row = project({ armor: null, armor_unknown: "ItemArmorTotal has no ilvl 999 Plate entry" });
    expect(row.armor_unknown).toContain("ItemArmorTotal");
  });

  test("never carries a drop source, and says so", () => {
    const view = projectItemsView({
      meta: { build: "1.60.1.1", ingested_at: "now" } as ForeverCatalog["meta"],
      items: [item({})], item_sets: [], zones: [], maps: [],
    });
    expect(view.items[0]).not.toHaveProperty("drop_sources");
    expect(view.meta.drop_sources_unknown).toContain("never asserts one");
  });
});
