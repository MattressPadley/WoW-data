# Loot Query Tools

Three CLI tools query loot from the Blizzard Journal API, filter it by class/spec, and resolve item levels using the seasonal data system.

## Tools overview

| Tool | Purpose | Source |
|------|---------|--------|
| `raid-journal.ts` | Raid boss mechanics and loot tables | `src/raid-journal.ts` + `src/lib/raid-journal.ts` |
| `dungeon-loot.ts` | Current season dungeon loot by class | `src/dungeon-loot.ts` + `src/lib/dungeon-loot.ts` |
| `upgrades.ts` | Find dungeon upgrades for a character | `src/upgrades.ts` |

All tools are run via `./run src/<tool>.ts [flags]` and output JSON. Add `--pretty` for formatted output.

## raid-journal.ts

The most feature-rich tool. Queries raid data from the Blizzard Journal API.

### Actions

| Flag combo | Action |
|-----------|--------|
| `--raids` | List all raids in the journal |
| `--expansion-id <id>` | List raids for a specific expansion |
| `--search "<query>"` | Search raids by name (case-insensitive partial match) |
| `--raid-id <id>` | Raid overview with encounter list |
| `--raid-id <id> --loot` | Full loot table for all bosses |
| `--boss-id <id>` | Single encounter mechanics |
| `--boss-id <id> --loot` | Single encounter loot table |

### Loot flags

| Flag | Description | Default |
|------|-------------|---------|
| `--difficulty <lfr\|normal\|heroic\|mythic>` | Resolve ilvls for this difficulty | `normal` |
| `--class <class>` | Filter loot for a class | none (show all) |
| `--spec <spec>` | Narrow to a spec's primary stat (requires `--class`) | none (class-level) |
| `--season <slug>` | Override current season for ilvl resolution | current season |
| `--no-cache` | Skip item cache | false |

### Loot output fields

Each item in the loot output includes:

```json
{
  "id": 249293,
  "name": "Weight of Command",
  "quality": "Epic",
  "ilvl": 44,
  "difficulty_ilvl": 246,
  "track": "champion",
  "rank": 1,
  "upgrade_range": { "min": 246, "max": 263, "ranks": 6 },
  "slot": "One-Hand",
  "armor_type": "Mace",
  "stats": [
    { "name": "Intellect", "value": 27 },
    { "name": "Stamina", "value": 7 },
    { "name": "Critical Strike", "value": 6 },
    { "name": "Versatility", "value": 3 }
  ],
  "effects": ["Use: Synthesize a soulbound set chest item..."],
  "binding": "Binds when picked up",
  "description": "",
  "boss": "Imperator Averzian"
}
```

Key fields:
- `ilvl` — base ilvl from the API (not difficulty-adjusted)
- `difficulty_ilvl` — actual ilvl at the requested difficulty, resolved from seasonal data
- `track` — upgrade track name (e.g. champion, hero, myth)
- `rank` — rank within the track (higher = later bosses)
- `upgrade_range` — min/max ilvl and total ranks for the track
- `effects` — proc, on-use, and equip effects (important for trinkets and tier tokens)

### Examples

```bash
# Search for a raid
./run src/raid-journal.ts --search "voidspire"

# Full raid loot at heroic
./run src/raid-journal.ts --raid-id 1307 --loot --difficulty heroic

# Windwalker monk loot from Voidspire Normal
./run src/raid-journal.ts --raid-id 1307 --loot --class monk --spec ww --difficulty normal

# Holy paladin loot from a specific boss at mythic
./run src/raid-journal.ts --boss-id 2795 --loot --class paladin --spec holy --difficulty mythic

# Boss mechanics (no loot)
./run src/raid-journal.ts --boss-id 2795
```

## dungeon-loot.ts

Queries loot from all current season dungeons, filtered by class/spec.

### Flags

| Flag | Description | Required |
|------|-------------|----------|
| `--realm <slug>` + `--name <char>` | Get class from character profile | one of these |
| `--class <class>` | Specify class directly | or this |
| `--spec <spec>` | Narrow to a spec's primary stat | no |
| `--slot <slots>` | Comma-separated slot filter (e.g. `head,chest,ring`) | no |
| `--dungeon "<name>"` | Filter to a specific dungeon (partial match) | no |

### Examples

```bash
# All monk dungeon loot
./run src/dungeon-loot.ts --class monk

# Resto shaman loot from a specific dungeon
./run src/dungeon-loot.ts --class shaman --spec resto --dungeon "Halls of Atonement"

# Loot for a character's class, filtered to specific slots
./run src/dungeon-loot.ts --realm turalyon --name treepunch --slot head,trinket
```

## upgrades.ts

Compares a character's current gear against dungeon loot to find upgrade opportunities.

### Flags

| Flag | Description | Required |
|------|-------------|----------|
| `--realm <slug>` | Character realm | yes |
| `--name <char>` | Character name | yes |
| `--spec <spec>` | Narrow to a spec's primary stat | no |
| `--slots <slots>` | Only look for upgrades in these slots | no |
| `--min-ilvl <ilvl>` | Minimum ilvl threshold | no |

### Examples

```bash
# Full upgrade scan
./run src/upgrades.ts --realm turalyon --name treepunch

# Windwalker-specific upgrades for specific slots
./run src/upgrades.ts --realm turalyon --name treepunch --spec ww --slots head,chest,ring
```

## Architecture

### Data flow

```
Blizzard API
  │
  ├─ getJournalInstance() → raid/dungeon metadata + encounter list
  ├─ getJournalEncounter() → encounter mechanics + raw item list
  └─ getItem() → full item details (stats, effects, slot, subclass)
       │
       ├─ isItemForClass() → class/spec filter (src/lib/class-meta.ts)
       │    Uses: armor type, weapon allowlist, primary stats, off-hand rules,
       │          tier token prefixes from season.yaml
       │
       └─ resolveItemDifficultyIlvls() → ilvl resolution (src/lib/item-difficulty.ts)
            Uses: season.yaml tracks, track_ranks, boss_rank_rules
```

### Item caching

Both `raid-journal.ts` and `dungeon-loot.ts` use an in-memory item cache (`Map<number, any>`) to avoid re-fetching the same item across encounters. Items are fetched in batches of 10 to stay within rate limits.

### Shared code

| Module | Exports | Used by |
|--------|---------|---------|
| `src/lib/class-meta.ts` | `isItemForClass`, `getArmorType`, `normalizeClass`, `normalizeSpec`, etc. | All loot tools |
| `src/lib/item-difficulty.ts` | `resolveItemDifficultyIlvls` | raid-journal |
| `src/lib/season.ts` | `loadSeason`, `getDisplayIlvl`, `getUpgradeRange`, `getBossRank` | item-difficulty, raid-journal |
| `src/lib/raid-journal.ts` | `getRaidLoot`, `getRaidDetail`, `getEncounterDetail`, etc. | raid-journal CLI |
| `src/lib/dungeon-loot.ts` | `filterLootForClass`, `getDungeonLoot`, `getCurrentSeasonDungeons` | dungeon-loot CLI, upgrades CLI |
