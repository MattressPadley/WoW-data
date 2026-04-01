---
name: delve-helper
description: Look up delve reward ilvl by bountiful tier, including end-of-run and Great Vault rewards with upgrade track info. Uses seasonal data from season.yaml.
---

# WoW Delve Helper

Look up delve reward item levels by bountiful tier. Delves are not in the Blizzard Journal API, so this tool works purely from curated seasonal data — no API calls needed.

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All output is **JSON**. Add `--pretty` for formatted output.

## Tools

| Tool | Purpose |
|------|---------|
| `delve-rewards.ts` | Delve reward ilvl by tier |

## Tool: delve-rewards.ts

| Action | Command |
|--------|---------|
| Single tier lookup | `./run src/delve-rewards.ts --tier 8` |
| Full tier table | `./run src/delve-rewards.ts --table` |
| With season override | `./run src/delve-rewards.ts --tier 8 --season midnight-s1` |

### Flags

- `--tier <N>` — look up rewards for a specific bountiful delve tier (1-11)
- `--table` — dump the full reward table for all tiers
- `--season <slug>` — override the current season (defaults to `seasons/current.yaml`)
- `--pretty` — formatted JSON output

### Output fields

Each tier result includes:
- `end_of_run` — reward from the bountiful chest: `ilvl`, `track`, `rank`, `upgrade_range`
- `vault` — Great Vault reward: `ilvl`, `track`, `rank`, `upgrade_range`

## Delve Reward Mechanics

- Delve rewards scale with **bountiful tier** (1-11)
- Rewards **cap at tier 8** — tiers 9-11 give the same ilvl as tier 8 (plus crests)
- Great Vault requires completing **8 delves per week** for maximum reward slots
- Vault reward is based on the **highest tier completed** that week
- Bountiful delves require a **Restored Coffer Key** to access the bountiful chest

### End-of-Run ilvl Table (Midnight S1)

| Tier | ilvl | Track |
|------|------|-------|
| 1 | 220 | Adventurer 1/6 |
| 2 | 224 | Adventurer 2/6 |
| 3 | 227 | Adventurer 3/6 |
| 4 | 230 | Adventurer 4/6 |
| 5 | 233 | Veteran 1/6 |
| 6 | 237 | Veteran 2/6 |
| 7 | 246 | Champion 1/6 |
| 8+ | 250 | Champion 2/6 (cap) |

### Great Vault ilvl Table (Midnight S1)

| Tier | ilvl | Track |
|------|------|-------|
| 1 | 233 | Veteran 1/6 |
| 2 | 237 | Veteran 2/6 |
| 3 | 240 | Veteran 3/6 |
| 4 | 243 | Veteran 4/6 |
| 5 | 246 | Champion 1/6 |
| 6 | 253 | Champion 3/6 |
| 7 | 256 | Champion 4/6 |
| 8+ | 259 | Hero 1/6 |

## Presenting reward data

When formatting delve rewards for the user, show:
- **Tier, ilvl, track and rank** — e.g. Tier 8: Champion 2/6 (250)
- **Upgrade range** — e.g. Champion (246-263)
- **End-of-run vs vault** — always show both
- Highlight **tier 8 as the practical cap** for gear rewards

## Important

- Delves have **no journal data** in the Blizzard API — no boss mechanics, encounters, or loot tables
- All reward data comes from `season.yaml` — update the YAML when a new season launches
- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
