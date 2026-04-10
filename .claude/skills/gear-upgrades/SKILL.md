---
name: gear-upgrades
description: Check a WoW character's gear for weak slots and find upgrade opportunities across all feasible content (heroic/M0/M+ dungeons and LFR through mythic raids) with ilvl data, lockout tracking, and saved character profiles.
---

# WoW Gear & Upgrade Tools

Compound tools that combine character profile, equipment, dungeon journal, and raid journal APIs to analyze gear and find upgrades across all current season content. For raw API access, use the `wow-api` skill.

## Setup

Characters are stored in `user/characters/<slug>.yaml` with an active character pointer in `user/active.yaml`. When an active character is set, all tools work without `--realm`/`--name` flags.

```bash
# Add a character (creates YAML + sets as active)
./run src/character.ts --add --name treepunch --realm turalyon --class monk --spec ww --pretty

# List saved characters
./run src/character.ts --list-saved --pretty

# Switch active character
./run src/character.ts --set-active treepunch --pretty

# Show active character
./run src/character.ts --active --pretty
```

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All tools output **JSON by default**. Add `--pretty` for formatted output. All tools accept `--region` (default: `us`), `--character <slug>`, and `--pretty`.

## Tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `upgrades.ts` | **Primary** — upgrades from all feasible content with ilvl + lockouts | `--threshold`, `--slots`, `--all-slots`, `--min-ilvl` |
| `gear-check.ts` | Quick gear summary with weak slot detection | (none required) |
| `dungeon-loot.ts` | Browse season dungeon loot by class/spec/slot | `--class`, `--spec`, `--dungeon`, `--slot` |

## Workflows

### Full upgrade analysis (recommended)

```bash
# All feasible upgrades (dungeons + raids, auto-filtered by ilvl threshold)
./run src/upgrades.ts --pretty

# Adjust feasibility threshold (default: 20 ilvl above avg)
./run src/upgrades.ts --threshold 30 --pretty

# Target specific slots
./run src/upgrades.ts --slots head,chest,ring --pretty

# Show all slots (not just weak ones)
./run src/upgrades.ts --all-slots --pretty

# Filter by minimum ilvl
./run src/upgrades.ts --min-ilvl 240 --pretty

# Use a specific character
./run src/upgrades.ts --character bankalt --pretty
```

The upgrades tool:
- Queries **all content sources**: heroic dungeons, M0, M+ key levels, and raids at every difficulty (LFR through Mythic)
- Uses a **feasibility threshold** (default +20 ilvl over avg) to filter out content the character can't realistically complete
- Shows **drop ilvl and vault ilvl** for each item with the ilvl gain vs. current gear
- Detects **weekly raid lockouts** and marks bosses already killed this reset
- Provides a **priority list** sorted by biggest potential upgrade
- Identifies weak slots (below average ilvl) by default

### Output structure

- `character` — name, realm, class, spec, avg/equipped ilvl
- `feasibility` — threshold, max feasible drop ilvl, list of feasible content sources with ilvls
- `raid_lockouts` — bosses killed this reset week (if any)
- `weak_gear` — equipped items in target slots sorted by ilvl
- `priority` — slots sorted by max potential ilvl gain
- `upgrades` — per-slot arrays of upgrade items with source, boss, difficulty, drop ilvl, vault ilvl, ilvl gain, and locked status

### Quick gear check

```bash
./run src/gear-check.ts --pretty
```

### Browse dungeon loot

```bash
# All loot for active character's class
./run src/dungeon-loot.ts --pretty

# By class (no character needed)
./run src/dungeon-loot.ts --class monk --spec ww --pretty

# Filter by slot or dungeon
./run src/dungeon-loot.ts --slot head --pretty
./run src/dungeon-loot.ts --dungeon "Halls of Atonement" --pretty
```

### Backward compatible (explicit realm/name)

```bash
./run src/gear-check.ts --realm turalyon --name treepunch --pretty
./run src/upgrades.ts --realm turalyon --name treepunch --pretty
./run src/dungeon-loot.ts --realm turalyon --name treepunch --pretty
```

## Important

- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
