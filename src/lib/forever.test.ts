import { describe, expect, test } from "bun:test";
import {
  computeItemStats,
  computeStatValue,
  loadEnums,
  resolveStatBudget,
  type StatContext,
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
