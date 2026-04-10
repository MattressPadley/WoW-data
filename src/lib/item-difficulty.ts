/**
 * Resolves display item levels for raid loot using seasonal data.
 * Loads upgrade track YAML and maps difficulty + boss position → actual ilvl.
 */

import {
  loadSeason,
  getDisplayIlvl,
  getUpgradeRange,
  getBossRank,
  getDungeonIlvl,
  getMythicPlusIlvl,
  getMythicPlusVaultIlvl,
  type SeasonData,
} from "./season.ts";

export interface DifficultyIlvl {
  ilvl: number;
  track: string;
  rank: number;
  upgrade_range: { min: number; max: number; ranks: number };
}

export interface DungeonDifficultyIlvl extends DifficultyIlvl {
  vault_ilvl?: number;
  vault_track?: string;
  vault_rank?: number;
  vault_upgrade_range?: { min: number; max: number; ranks: number };
  crest?: string;
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

/**
 * Batch-resolve display ilvls for dungeon items using seasonal data.
 * All dungeon items get the same ilvl (no boss position logic).
 * For M+ key levels, includes both end-of-dungeon and vault ilvls.
 */
export async function resolveDungeonItemIlvls(
  itemIds: number[],
  options: { difficulty?: string; keyLevel?: number; seasonSlug?: string },
): Promise<Map<number, DungeonDifficultyIlvl>> {
  let season: SeasonData;
  try {
    season = await loadSeason(options.seasonSlug);
  } catch {
    return new Map();
  }

  const results = new Map<number, DungeonDifficultyIlvl>();

  if (options.keyLevel != null && options.keyLevel > 0) {
    const mpIlvl = getMythicPlusIlvl(season, options.keyLevel);
    if (!mpIlvl) return results;

    for (const itemId of itemIds) {
      results.set(itemId, {
        ilvl: mpIlvl.end_of_dungeon.ilvl,
        track: mpIlvl.end_of_dungeon.track,
        rank: mpIlvl.end_of_dungeon.rank,
        upgrade_range: mpIlvl.end_of_dungeon.upgrade_range,
        vault_ilvl: mpIlvl.vault.ilvl,
        vault_track: mpIlvl.vault.track,
        vault_rank: mpIlvl.vault.rank,
        vault_upgrade_range: mpIlvl.vault.upgrade_range,
        crest: mpIlvl.crest,
      });
    }
  } else if (options.keyLevel === 0) {
    // M0: end-of-dungeon ilvl from dungeon_difficulty_track, vault from mythic_plus_vault
    const dIlvl = getDungeonIlvl(season, "mythic");
    if (!dIlvl) return results;
    const vaultInfo = getMythicPlusVaultIlvl(season, 0);

    for (const itemId of itemIds) {
      results.set(itemId, {
        ilvl: dIlvl.ilvl,
        track: dIlvl.track,
        rank: dIlvl.rank,
        upgrade_range: dIlvl.upgrade_range,
        vault_ilvl: vaultInfo?.ilvl,
        vault_track: vaultInfo?.track,
        vault_rank: vaultInfo?.rank,
        vault_upgrade_range: vaultInfo?.upgrade_range,
      });
    }
  } else if (options.difficulty) {
    const dIlvl = getDungeonIlvl(season, options.difficulty);
    if (!dIlvl) return results;

    for (const itemId of itemIds) {
      results.set(itemId, {
        ilvl: dIlvl.ilvl,
        track: dIlvl.track,
        rank: dIlvl.rank,
        upgrade_range: dIlvl.upgrade_range,
      });
    }
  }

  return results;
}
