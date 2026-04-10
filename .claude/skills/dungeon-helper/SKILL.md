---
name: dungeon-helper
description: Query dungeon journal data (bosses, mechanics, loot by class/spec/difficulty/M+ key level) and manage per-encounter dungeon notes and seasonal data. Uses dungeon-journal and season tools.
---

# WoW Dungeon Helper

Look up dungeon boss mechanics, loot tables filtered by class and difficulty with accurate ilvl from the seasonal upgrade track system — including M+ end-of-dungeon and Great Vault ilvl — and maintain per-encounter strategy notes. For raw API access, use the `wow-api` skill.

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All output is **JSON**. Add `--pretty` for formatted output. All tools accept `--region` (default: `us`).

## Tools

| Tool | Purpose |
|------|---------|
| `dungeon-journal.ts` | Dungeon bosses, mechanics, and loot |
| `season.ts` | Seasonal data management (upgrade tracks, ilvl) |

## Tool: dungeon-journal.ts

| Action | Command |
|--------|---------|
| List all dungeons | `./run src/dungeon-journal.ts --dungeons` |
| Current M+ keystone rotation | `./run src/dungeon-journal.ts --season-dungeons` |
| Dungeons for an expansion | `./run src/dungeon-journal.ts --expansion-id <id>` |
| Search dungeons by name | `./run src/dungeon-journal.ts --search "<query>"` |
| Dungeon overview + boss list | `./run src/dungeon-journal.ts --dungeon-id <id>` |
| Boss mechanics | `./run src/dungeon-journal.ts --boss-id <id>` |
| Dungeon loot (M0 default) | `./run src/dungeon-journal.ts --dungeon-id <id> --loot` |
| Loot at difficulty | `./run src/dungeon-journal.ts --dungeon-id <id> --loot --difficulty heroic` |
| Loot at M+ key level | `./run src/dungeon-journal.ts --dungeon-id <id> --loot --key-level 10` |
| Loot filtered by class | `./run src/dungeon-journal.ts --dungeon-id <id> --loot --class monk --key-level 10` |
| Loot filtered by spec | `./run src/dungeon-journal.ts --dungeon-id <id> --loot --class monk --spec ww --key-level 10` |
| Boss loot at difficulty | `./run src/dungeon-journal.ts --boss-id <id> --loot --difficulty mythic` |

### Difficulty flag

`--difficulty <normal|heroic|mythic>` (default: `mythic` / M0). Loot output includes `difficulty_ilvl`, `track`, `rank`, and `upgrade_range` from seasonal data. Normal difficulty has no upgrade track (ilvl 214).

### Key level flag

`--key-level <N>` for M+ key levels (2-18+). Mutually exclusive with `--difficulty`. Loot output includes:
- `end_of_dungeon_ilvl` — Challenger's Cache ilvl (caps at +10)
- `vault_ilvl` — Great Vault reward ilvl (scales to +18)
- `track`, `rank`, `upgrade_range` — for end-of-dungeon drop
- `vault_track`, `vault_rank`, `vault_upgrade_range` — for vault reward
- `crest` — crest type earned at this key level

### Spec flag

`--spec <spec>` narrows loot to a single spec's primary stat. Requires `--class`. Supports shortcuts: `ww`, `mw`, `brew`, `ret`, `prot`, `holy`, `resto`, `enh`, `ele`, `bm`, `mm`, `surv`, `sub`, `sin`, `boom`, `bear`, `cat`, `havoc`, `veng`/`vdh`, `blood`, `frost`, `unholy`, `fury`, `arms`, `fire`, `arcane`, `demo`, `destro`, `aff`, `disc`, `shadow`, `dev`, `pres`, `aug`.

### Season flag

`--season <slug>` overrides the current season (defaults to `seasons/current.yaml`).

### Class names

Use any of: warrior, paladin, dk, hunter, shaman, evoker, rogue, monk, dh, druid, mage, warlock, priest. Shortcuts `dk` and `dh` are supported.

### Class/spec filtering details

Same filtering as raid-helper:
- **Armor type** — only shows the class's armor (Plate/Mail/Leather/Cloth)
- **Weapons** — only weapon types the class can equip, filtered by primary stat
- **Trinkets/rings/necks/cloaks** — filtered by primary stat (secondary-only items pass for all)
- **Shields** — only for Warrior/Paladin/Shaman
- **Off-hands** — only for caster-capable classes
- **Junk/decor/recipes** — filtered out

### Legacy dungeon loot filtering

Legacy dungeons (Skyreach, Pit of Saron, etc.) have bloated journal loot tables from their original expansion. The tool automatically filters these using `min_item_id` thresholds defined per-dungeon in `season.yaml`, keeping only the curated M+ items Blizzard created for the current rotation. This filtering applies when using `--dungeon-id --loot`; the `--boss-id --loot` path does not filter legacy items, so prefer `--dungeon-id` for legacy dungeons.

## M+ Loot Mechanics

- In M+, bosses don't drop loot individually — **2 items** come from the **Challenger's Cache** at the end of the dungeon
- Items are drawn from **any boss's loot table** in the dungeon
- All dungeon items drop at the same ilvl within a difficulty (no boss position ranking)
- End-of-dungeon ilvl **caps at +10** — higher keys give crests, not higher ilvl drops
- Great Vault scales up to **+18**

### End-of-Dungeon ilvl Table (Midnight S1)

| Key | ilvl | Track |
|-----|------|-------|
| M0 | 246 | Champion 1/6 |
| +2, +3 | 250 | Champion 2/6 |
| +4 | 253 | Champion 3/6 |
| +5 | 256 | Champion 4/6 |
| +6, +7 | 259 | Hero 1/6 |
| +8, +9 | 263 | Hero 2/6 |
| +10+ | 266 | Hero 3/6 (cap) |

### Great Vault ilvl Table (Midnight S1)

| Key | ilvl | Track |
|-----|------|-------|
| M0 | 256 | Champion 4/6 |
| +2, +3 | 259 | Hero 1/6 |
| +4, +5 | 263 | Hero 2/6 |
| +6 | 266 | Hero 3/6 |
| +7, +8, +9 | 269 | Hero 4/6 |
| +10, +11 | 272 | Myth 1/6 |
| +12-14 | 276 | Myth 2/6 |
| +15-17 | 279 | Myth 3/6 |
| +18+ | 282 | Myth 4/6 |

### Non-M+ Dungeon Difficulties

| Difficulty | ilvl | Track |
|-----------|------|-------|
| Normal | 214 | No track |
| Heroic | 230 | Adventurer 4/6 |
| Mythic (M0) | 246 | Champion 1/6 |

### Crest Drops

| Crest | Key Range |
|-------|-----------|
| Champion Dawncrest | +2 to +3 |
| Hero Dawncrest | +4 to +8 |
| Myth Dawncrest | +9+ |

## Tool: season.ts

Seasonal data is shared with the raid-helper skill. See `raid-helper` SKILL.md for full season tool documentation.

| Action | Command |
|--------|---------|
| View current season | `./run src/season.ts --info` |
| Switch active season | `./run src/season.ts --set-current <slug>` |

## Dungeon Notes System

Dungeon notes live in `user/notes/dungeons/<dungeon-slug>/` where `<dungeon-slug>` is the dungeon name slugified (e.g., `magisters-terrace`, `pit-of-saron`).

```
user/notes/dungeons/<dungeon-slug>/
  overview.md         # Route, general strategy, trash priority
  <boss-slug>.md      # Per-boss notes
```

### Creating notes

1. **Slugify the dungeon name**: lowercase, replace spaces with hyphens, strip special characters
2. **Create the directory** and files using these templates:

**overview.md**: `# <Dungeon Name>` with sections for Route, Trash Priority, and General Notes.

**Per-boss (<boss-slug>.md)**: `# <Boss Name>` with sections for Strategy, Mechanics, Role Notes (Tanks/Healers/DPS), and Reminders.

### Updating notes

- Append or update sections, don't overwrite whole files
- Keep notes concise and actionable — M+ reference cards
- Include M+ specific tips (important trash, interrupt priorities, key ability timings)

## Workflows

### Look up dungeon loot at M+ key level

```bash
./run src/dungeon-journal.ts --search "magisters" --pretty
./run src/dungeon-journal.ts --dungeon-id <id> --pretty
./run src/dungeon-journal.ts --dungeon-id <id> --loot --key-level 10 --class monk --spec ww --pretty
```

### Check what loot a boss drops

```bash
./run src/dungeon-journal.ts --boss-id <id> --pretty
./run src/dungeon-journal.ts --boss-id <id> --loot --key-level 10 --class paladin --spec holy --pretty
```

### Browse current M+ season dungeons

```bash
./run src/dungeon-journal.ts --season-dungeons --pretty
```

## Presenting loot data

When formatting loot results for the user, show **all available fields**:
- **Name, slot, armor type, ilvl** — basics
- **Stats** — primary and secondary stats
- **Effects** — proc/on-use text (critical for trinkets)
- **Track and upgrade range** — e.g. Hero 1/6 (259→276)
- For M+ queries: **end-of-dungeon ilvl** vs **vault ilvl** and **crest** type

## Important

- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
