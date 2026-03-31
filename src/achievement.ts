#!/usr/bin/env bun
/**
 * achievement.ts — List/get achievements or achievement categories
 *
 * Usage:
 *   ./run src/achievement.ts [--pretty]                        # list achievements
 *   ./run src/achievement.ts --id 6 [--pretty]                 # get achievement
 *   ./run src/achievement.ts --id 6 --media [--pretty]         # get achievement media
 *   ./run src/achievement.ts --categories [--pretty]           # list categories
 *   ./run src/achievement.ts --category-id 81 [--pretty]       # get category
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  const id = getArg("--id");
  const categoryId = getArg("--category-id");

  if (categoryId) {
    data = await api.getAchievementCategory(parseInt(categoryId, 10));
  } else if (hasFlag("--categories")) {
    data = await api.getAchievementCategoryIndex();
  } else if (id) {
    const achievementId = parseInt(id, 10);
    data = hasFlag("--media")
      ? await api.getAchievementMedia(achievementId)
      : await api.getAchievement(achievementId);
  } else {
    data = await api.getAchievementIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
