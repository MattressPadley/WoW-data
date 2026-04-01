---
name: raid-helper
description: Query raid journal data (bosses, mechanics, loot by class/armor/difficulty) and manage per-encounter raid notes and seasonal data. Uses raid-journal and season tools.
---

# WoW Raid Helper

Look up raid boss mechanics, loot tables filtered by class and difficulty with accurate ilvl from the seasonal upgrade track system, and maintain per-encounter strategy notes. For raw API access, use the `wow-api` skill.

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All output is **JSON**. Add `--pretty` for formatted output. All tools accept `--region` (default: `us`).

## Tools

| Tool | Purpose |
|------|---------|
| `raid-journal.ts` | Raid bosses, mechanics, and loot |
| `season.ts` | Seasonal data management (upgrade tracks, ilvl) |

## Tool: raid-journal.ts

| Action | Command |
|--------|---------|
| List all raids | `./run src/raid-journal.ts --raids` |
| Raids for an expansion | `./run src/raid-journal.ts --expansion-id <id>` |
| Search raids by name | `./run src/raid-journal.ts --search "<query>"` |
| Raid overview + encounter list | `./run src/raid-journal.ts --raid-id <id>` |
| Boss mechanics | `./run src/raid-journal.ts --boss-id <id>` |
| Raid loot (Normal default) | `./run src/raid-journal.ts --raid-id <id> --loot` |
| Raid loot at difficulty | `./run src/raid-journal.ts --raid-id <id> --loot --difficulty heroic` |
| Loot filtered by class + diff | `./run src/raid-journal.ts --boss-id <id> --loot --class monk --difficulty mythic` |

### Difficulty flag

`--difficulty <lfr|normal|heroic|mythic>` (default: `normal`). Loot output includes `difficulty_ilvl`, `track` (e.g. champion), `rank`, and `upgrade_range` from seasonal data.

### Season flag

`--season <slug>` overrides the current season (defaults to `seasons/current.yaml`).

### Class names

Use any of: warrior, paladin, dk, hunter, shaman, evoker, rogue, monk, dh, druid, mage, warlock, priest. Shortcuts `dk` and `dh` are supported.

## Tool: season.ts

| Action | Command |
|--------|---------|
| Bootstrap a season | `./run src/season.ts --bootstrap --slug <slug> --raid-id <id>` |
| Bootstrap with metadata | `./run src/season.ts --bootstrap --slug midnight-s1 --raid-id 1314 --name "Midnight Season 1" --expansion Midnight --patch 12.0` |
| View current season | `./run src/season.ts --info` |
| Switch active season | `./run src/season.ts --set-current <slug>` |

Bootstrap probes Wowhead tooltips with wago-derived bonus IDs to discover the real ilvl and upgrade track for each difficulty and rank. One-time per season (~24 HTTP requests).

## Seasonal Data System

Seasonal data lives in `seasons/` (git-tracked, human-readable YAML):

```
seasons/
  current.yaml                        # pointer: { slug: midnight-s1 }
  midnight-s1/
    season.yaml                       # upgrade tracks, ilvl ranges, raid mapping
    bootstrap-log.yaml                # audit trail of Wowhead queries
    progress/                         # personal seasonal data (markdown)
      raids.md                        # kill tracking, lockouts
      mythic-plus.md                  # M+ score, best runs
      gear.md                         # gear snapshots, wishlists
```

### Season YAML schema

`season.yaml` contains:
- **tracks** — upgrade track names with min/max ilvl and rank count
- **track_ranks** — explicit ilvl per rank for each track
- **raid_difficulty_track** — maps difficulty → track name
- **boss_rank_rules** — maps boss position → starting rank

### New season workflow

```bash
# 1. Bootstrap with a raid from the new season
./run src/season.ts --bootstrap --slug new-season-s1 --raid-id <id> --name "Season Name" --expansion "Expansion" --patch "X.Y"

# 2. Verify
./run src/season.ts --info --pretty

# 3. Test loot
./run src/raid-journal.ts --raid-id <id> --loot --difficulty normal --pretty
```

## Workflows

### Look up a raid with loot at difficulty

```bash
./run src/raid-journal.ts --search "dreamrift" --pretty
./run src/raid-journal.ts --raid-id 1314 --pretty
./run src/raid-journal.ts --boss-id 2795 --loot --difficulty heroic --pretty
./run src/raid-journal.ts --raid-id 1314 --loot --class monk --difficulty mythic --pretty
```

## Raid Notes System

Raid notes live in `notes/raids/<raid-slug>/` where `<raid-slug>` is the raid name slugified (e.g., `nerubar-palace`, `the-dreamrift`).

```
notes/raids/<raid-slug>/
  overview.md         # Raid-level notes (comp, general strategy)
  <boss-slug>.md      # Per-encounter notes
```

### Creating notes

1. **Slugify the raid name**: lowercase, replace spaces with hyphens, strip special characters
2. **Create the directory** and files using these templates:

**overview.md**: `# <Raid Name>` with sections for Composition and General Notes.

**Per-encounter**: `# <Boss Name>` with sections for Strategy, Phase Notes, Role Notes (Tanks/Healers/DPS), and Reminders.

### Updating notes

- Append or update sections, don't overwrite whole files
- Keep notes concise and actionable — raid-night reference cards
- Before a raid, read notes + API mechanics for a complete picture

## Important

- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
