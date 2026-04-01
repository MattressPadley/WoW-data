# Seasonal Data System

Seasonal data drives item level resolution and tier token filtering for raid and dungeon loot. It is stored as human-readable YAML in the `seasons/` directory, git-tracked alongside the codebase.

## Directory structure

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

## season.yaml schema

```yaml
name: Midnight Season 1
slug: midnight-s1
expansion: Midnight
patch: "12.0"

# Upgrade tracks — each defines an ilvl range and number of upgrade ranks
tracks:
  adventurer: { min_ilvl: 220, max_ilvl: 237, ranks: 6 }
  veteran:    { min_ilvl: 233, max_ilvl: 250, ranks: 6 }
  champion:   { min_ilvl: 246, max_ilvl: 263, ranks: 6 }
  hero:       { min_ilvl: 259, max_ilvl: 276, ranks: 6 }
  myth:       { min_ilvl: 272, max_ilvl: 289, ranks: 6 }

# Explicit ilvl at each rank within a track (1-indexed by array position)
track_ranks:
  adventurer: [220, 224, 227, 230, 233, 237]
  veteran:    [233, 237, 240, 243, 246, 250]
  champion:   [246, 250, 253, 256, 259, 263]
  hero:       [259, 263, 266, 269, 272, 276]
  myth:       [272, 276, 279, 282, 285, 289]

# Which upgrade track each raid difficulty maps to
raid_difficulty_track:
  lfr: veteran
  normal: champion
  heroic: hero
  mythic: myth

# Boss position → starting rank within the difficulty's track
# Later bosses in the raid drop higher-ranked items
boss_rank_rules:
  - positions: [1]
    rank: 1
  - positions: [2, 3]
    rank: 2
  - positions: [4, 5]
    rank: 3
  - positions: [6]
    rank: 4
  - positions: [7, 8, 9, 10]
    rank: 6

# Crest type for the season (used in UI display)
crest_suffix: Dawncrest

# Tier token prefix → armor type (for class-filtered loot)
# Each raid in the season may use different naming — add all variants
tier_token_prefixes:
  Voidforged: Plate       # The Voidspire tokens
  Voidcast: Mail
  Voidcured: Leather
  Voidwoven: Cloth
  Alnforged: Plate        # The Dreamrift tokens
  Alncast: Mail
  Alncured: Leather
  Alnwoven: Cloth
```

## How raid ilvl resolution works

When `--difficulty` is specified on a raid loot query, the system resolves each item's display ilvl:

1. **Difficulty → track**: `raid_difficulty_track` maps e.g. `normal` → `champion`
2. **Boss position → rank**: `boss_rank_rules` maps the boss's position in the encounter list to a starting rank within the track (later bosses = higher rank)
3. **Track + rank → ilvl**: `track_ranks` provides the exact ilvl at each rank

Example: Normal difficulty, boss 4 (Vaelgor & Ezzorak in Voidspire)
- Difficulty `normal` → track `champion`
- Boss position 4 → rank 3 (from `positions: [4, 5]`)
- Champion rank 3 → ilvl 253
- Upgrade range: 246–263 (6 ranks)

## How dungeon/M+ ilvl resolution works

Dungeon loot uses different fields from `season.yaml`:

### Non-M+ difficulties

`dungeon_difficulty_track` maps difficulty → `{ track, rank }` directly (all bosses drop the same ilvl):
- `heroic` → Adventurer 4/6 (ilvl 230)
- `mythic` → Champion 1/6 (ilvl 246, M0)
- `normal` has no track (ilvl 214)

### M+ key levels

`mythic_plus_end_of_dungeon` and `mythic_plus_vault` map key level ranges to `{ track, rank }`:
- End-of-dungeon loot caps at +10 (Hero 3/6, ilvl 266)
- Great Vault scales to +18 (Myth 4/6, ilvl 282)

`mythic_plus_crests` maps key level ranges to crest types (champion, hero, myth).

### Keystone dungeon rotation

`keystone_dungeons` lists the 8 M+ rotation dungeons by journal instance ID. The `--season-dungeons` flag reads from this list (not the API's "Current Season" journal tier, which includes non-M+ dungeons).

Legacy dungeons may include a `min_item_id` field to filter out bloated historical loot tables from their original expansion. Only items with IDs at or above this threshold are shown.

## Bootstrapping a new season

The bootstrap process discovers real ilvl values by probing Wowhead tooltips with bonus IDs derived from the wago.tools DB2 data.

```bash
# 1. Bootstrap — probes ~24 Wowhead tooltips to build the track data
./run src/season.ts --bootstrap --slug new-season \
  --raid-id <id> \
  --name "Season Name" \
  --expansion "Expansion" \
  --patch "X.Y"

# 2. Verify the generated data
./run src/season.ts --info --pretty

# 3. Test loot ilvls are correct
./run src/raid-journal.ts --raid-id <id> --loot --difficulty normal --pretty
```

Bootstrap generates:
- `seasons/<slug>/season.yaml` — the full season config
- `seasons/<slug>/bootstrap-log.yaml` — audit trail of every Wowhead query

### Post-bootstrap steps

After bootstrapping, you need to manually add:
- **tier_token_prefixes** — run a loot query without class filter and look for Junk items that follow the `{Prefix}{Adjective} {TokenName}` pattern. Add each prefix with its armor type.

## Switching seasons

```bash
# View current season
./run src/season.ts --info --pretty

# Switch to a different season
./run src/season.ts --set-current <slug>
```

The active season is stored in `seasons/current.yaml` as `{ slug: <slug> }`. All loot tools default to the current season unless `--season <slug>` is passed explicitly.

## Code references

| File | Purpose |
|------|---------|
| `src/lib/season.ts` | Load season YAML, bootstrap, raid/dungeon/M+ ilvl helpers |
| `src/lib/item-difficulty.ts` | Batch resolve display ilvls for raids (`resolveItemDifficultyIlvls`) and dungeons (`resolveDungeonItemIlvls`) |
| `src/lib/dungeon-journal.ts` | Dungeon loot with class filtering and ilvl resolution |
| `src/season.ts` | CLI tool for season management |
| `seasons/current.yaml` | Active season pointer |
| `seasons/<slug>/season.yaml` | Per-season config (tracks, raids, dungeons, M+, keystone rotation) |
