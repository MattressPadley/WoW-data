---
name: gear-upgrades
description: Check a WoW character's gear for weak slots, browse current season dungeon loot filtered by class, and find upgrade opportunities. Uses gear-check, dungeon-loot, and upgrades tools.
---

# WoW Gear & Upgrade Tools

Compound tools that combine character profile, equipment, and dungeon journal APIs to analyze gear and find upgrades. For raw API access, use the `wow-api` skill.

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All tools output **JSON by default**. Add `--pretty` for formatted output. All tools accept `--region` (default: `us`) and `--pretty`.

## Tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `gear-check.ts` | Gear summary with weak slot detection | `--realm` (required), `--name` (required) |
| `dungeon-loot.ts` | Current season dungeon loot filtered by class | `--realm` + `--name` OR `--class`, `--dungeon`, `--slot` |
| `upgrades.ts` | Find gear upgrades from season dungeons | `--realm` (required), `--name` (required), `--slots`, `--min-ilvl` |

## Workflows

### Gear check & upgrades
```bash
# Gear summary sorted by ilvl, weak slots flagged
./run src/gear-check.ts --realm turalyon --name treepunch --pretty

# All current season dungeon loot filtered for a character's class
./run src/dungeon-loot.ts --realm turalyon --name treepunch --pretty

# Filter by slot
./run src/dungeon-loot.ts --class monk --slot head --pretty

# Filter by dungeon name
./run src/dungeon-loot.ts --dungeon "Halls of Atonement" --class monk --pretty

# Full upgrade finder — identifies weak slots and finds dungeon drops
./run src/upgrades.ts --realm turalyon --name treepunch --pretty

# Target specific slots
./run src/upgrades.ts --realm turalyon --name treepunch --slots head,chest,ring --pretty
```

## Important

- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
