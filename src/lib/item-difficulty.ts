/**
 * Resolves display item levels for raid loot using seasonal data.
 * Loads upgrade track YAML and maps difficulty + boss position → actual ilvl.
 */

import { loadSeason, getDisplayIlvl, getUpgradeRange, getBossRank, type SeasonData } from "./season.ts";

export interface DifficultyIlvl {
  ilvl: number;
  track: string;
  rank: number;
  upgrade_range: { min: number; max: number; ranks: number };
}

/**
 * Batch-resolve display ilvls for raid items using seasonal data.
 * @param itemIds - item IDs to resolve
 * @param difficulty - raid difficulty (lfr, normal, heroic, mythic)
 * @param bossPositions - map of itemId → boss position (1-indexed)
 * @param seasonSlug - optional season override (defaults to current)
 */
export async function resolveItemDifficultyIlvls(
  itemIds: number[],
  difficulty: string,
  bossPositions: Map<number, number>,
  seasonSlug?: string,
): Promise<Map<number, DifficultyIlvl>> {
  let season: SeasonData;
  try {
    season = await loadSeason(seasonSlug);
  } catch {
    // No seasonal data available — return empty
    return new Map();
  }

  const range = getUpgradeRange(season, difficulty);
  const results = new Map<number, DifficultyIlvl>();

  for (const itemId of itemIds) {
    const bossPos = bossPositions.get(itemId) ?? 1;
    const rank = getBossRank(season, bossPos);
    const ilvl = getDisplayIlvl(season, difficulty, bossPos);

    results.set(itemId, {
      ilvl,
      track: range.track,
      rank,
      upgrade_range: { min: range.min, max: range.max, ranks: range.ranks },
    });
  }

  return results;
}
