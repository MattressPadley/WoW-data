# Forever data

CLI and library reference for the **WoW Forever** data path — Vanilla content on the retail
engine. Forever data lives in the top-level `forever/` directory and is loaded by
`src/lib/forever.ts`; the CLI is `src/forever.ts`.

Naming: always "Forever", never "Classic". The sole exception is the wago product key
`wow_classic_beta` — Blizzard's literal API parameter.

## Why this is a separate path

| | Retail | Forever |
|---|---|---|
| Blizzard Game Data API | available | **dark** for the beta |
| Encounter Journal loot | available | unavailable (no `static-classic1x-*` namespace) |
| Item stat values | API or DB2 | DB2 + budget maths (computable) |
| Loot *sources* | Journal | server-side, **absent from the client** |

Two hard rules follow:

1. **No credentials, no `WoWAPI`.** Nothing reachable from `src/lib/forever.ts` may construct
   `WoWAPI` or import `src/lib/dungeon-loot.ts` / `src/lib/journal.ts`. `WoWAPI.ns()`
   (`src/api.ts:59`) only produces the retail namespace form, so any Journal call would fail
   with "Table not found". Run Forever tools with plain `bun run`, not `./run`.
2. **Unknown must read as unknown.** Drop sources and stats we cannot derive are emitted as
   explicit `unknown` / `null`, never as an empty list that looks complete and never guessed.

## Commands

Run with plain `bun run` — no credentials needed.

| Command | What it does |
|---|---|
| `--build-info` | Resolve the current Forever build from `wago.tools/api/builds` |
| `--refresh-enums [--build X]` | Re-snapshot the DBD enums into `forever/enums/` |
| `--ingest [--build X] [--no-cache]` | Ingest the item catalog into `forever/catalog/items.json` |
| `--item <id>` | One item with computed stats, effects, set and known drop sources |
| `--search <text> [--limit N]` | Name search across the ingested catalog |
| `--list-instances` | Instances in the vendored loot extract, with new-content counts |
| `--loot <instance>` | One instance's loot, item names resolved from the catalog |
| `--item-sources <id>` | Where an item drops, per the vendored extract only |
| `--audit-loot` | Cross-check the vendored loot rows against the ingested build |

```sh
bun run src/forever.ts --build-info --pretty
bun run src/forever.ts --refresh-enums          # only needed when the enums change
bun run src/forever.ts --ingest                 # ~19k items, a couple of seconds
bun run src/forever.ts --item 12640 --pretty    # Lionheart Helm
bun run src/forever.ts --loot "The Deadmines" --pretty
bun run src/forever.ts --audit-loot --pretty
```

## Build resolution

Forever builds live under the wago product key `wow_classic_beta`, which **mixes branches** —
it holds MoP-Classic `5.5.0.x` builds alongside Forever `1.60.1.x`, and the array is not
ordered by `created_at`. Filtering on the `1.60.1.` version prefix is therefore mandatory;
taking `[0]` yields a 14-month-stale MoP build. `resolveBuild()` in `src/lib/wago.ts` does the
prefix filter then sorts by `created_at`.

Builds ship roughly weekly, so pin one with `--build` for reproducibility.

## Cache layout

`src/lib/wago.ts` keys its cache by product and build:

```
data/cache/<product>/<build|live>/<name>.csv
```

Retail is `wow`/`live` and honours the 24h TTL. Pinned builds are immutable and never expire.
`getCachedCsv(name, noCache, { product, build })` — the options argument is optional, so
existing retail call sites are unchanged.

## Computed item stats

Forever runs the modern engine, so item stats are derived from the budget system rather than
stored:

```
budget = RandPropPoints[ItemLevel].<band>F_<slotGroup>
value  = round(StatPercentEditor[n] × budget ÷ 10000)      # halves round up
```

- **band** comes from `OverallQualityID`: Uncommon → `Good`, Rare/Heirloom → `Superior`,
  Epic/Legendary/Artifact → `Epic`. Poor and Common carry no budget.
- **slotGroup** groups `InventoryType` by budget share — head/chest/legs/two-hand = 0,
  shoulder/waist/feet/hands/trinket = 1, neck/wrist/finger/back/off-hand = 2,
  one-hand/main-hand = 3, ranged/thrown/relic = 4.
- Anything unresolvable (`Common` quality, a tabard, an item level with no `RandPropPoints`
  row) yields `value: null` plus an `unknown` reason.

Worked example — Lionheart Helm (12640), ilvl 61, Epic, Head, so `EpicF_0 = 45`:

| allocation | maths | value |
|---|---|---|
| `4000` STRENGTH | 4000 × 45 ÷ 10000 | **18** |
| `6222` CRIT_RATING | 6222 × 45 ÷ 10000 | **28** |
| `4444` HIT_RATING | 4444 × 45 ÷ 10000 | **20** |

### Enum snapshots, not hardcoded names

Stat ids are **not** hardcoded from memory. `forever/enums/*.json` are snapshots of wago's own
DBD metadata (`props.dbdMeta.enums` on the table browse page), recording the source URL and
build. Refresh with `--refresh-enums`. The snapshot for build `1.60.1.69977` gives `4` =
`STRENGTH`, `7` = `STAMINA`, `31` = `HIT_RATING`, `32` = `CRIT_RATING`.

### Validation

Computed values were checked against Wowhead's independent Forever data environment
(`nether.wowhead.com/forever/tooltip/item/<id>`) across a 60-item sample spanning quality and
item-level bands, including every exact `.5` rounding tie in the catalog: **58 match, 1
mismatch, 1 unusable**. The mismatch (252603 Red Dragonscale Leggings, Intellect 31 vs 32) is
an exact 31.5 tie that Wowhead resolves as if the item were ilvl 60 (`EpicF_0 = 44` → 30.8 →
31), i.e. a stale third-party snapshot; 15 of 16 ties confirm round-half-up.

## Loot

`forever/loot/dungeon-loot.json` is a checked-in offline extract of AtlasLootClassic's loot
tables — see `forever/loot/SOURCE.md` for the upstream repo, commit and GPLv2 attribution. It
is generated by evaluating the addon's Lua under a stub of AtlasLoot's module API, **not** by
regexing it, and nothing runs Lua at query time:

```sh
bun run scripts/extract-atlasloot.ts    # requires luajit on PATH
```

The module is loaded twice — with AtlasLoot's `IS_FOREVER` off and on — and diffed. That diff
is what `provenance` records:

- `vanilla` — in both passes: reused live-Vanilla loot, trustworthy.
- `forever-new` — only in the Forever pass: upstream **datamining**, unverified. Bosses made
  only of such rows get `loot_status: unknown-new-content` and an `unknown` reason.

Placeholder ids upstream leaves as `0` are emitted as `null` with a reason, never as `0`.
Instance names are resolved from the Forever build's own `AreaTable`.

## Known data-source limits

- **The item catalog is not a complete item list.** wago's `ItemSparse` export for Forever
  builds carries ~19.2k rows and omits many items that exist in game — e.g. 14149
  *Subterranean Cape* is live (Wowhead's Forever environment has it) but absent from the
  export, consistently across builds `.69876`–`.69977`. `--audit-loot` quantifies this:
  around a third of reused-Vanilla loot rows resolve to a catalog item, the rest report
  `unknown` rather than silently vanishing.
- **Every `forever-new` loot row is unresolvable** against the live build's items, which is
  itself evidence those ids are speculative. They stay flagged, never promoted.
- **Observed drop rates for Forever do not exist yet.** `drop_rates` in the extract are
  upstream's *Vanilla*-observed percentages and are never inferred for new content.
- **No armour or weapon damage values.** Those need `ItemArmorTotal`/`ItemDamage*`, which are
  out of Stage-1 scope. They are omitted rather than approximated.

## Related

- `forever/README.md` — directory layout
- `docs/loot-tools.md` — the retail Journal loot path (deliberately separate)
