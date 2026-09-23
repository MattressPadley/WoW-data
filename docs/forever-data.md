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
3. **Drop sources are shown only with provenance.** Every source carries a `source` stamp
   (`atlaslootclassic-extract` or `wowtbc-warcraftforever`); nothing is presented as an observed
   drop. See [Datamined dungeon tables (wowtbc.gg)](#datamined-dungeon-tables-wowtbcgg).

## Commands

Run with plain `bun run` — no credentials needed.

| Command | What it does |
|---|---|
| `--build-info` | Resolve the current Forever build from `wago.tools/api/builds` |
| `--refresh-enums [--build X]` | Re-snapshot the DBD enums into `forever/enums/` |
| `--ingest [--build X] [--no-cache]` | Ingest the item catalog into `forever/catalog/items.json` (+ `items-view.json`) |
| `--ingest-wowtbc [--build X] [--no-cache]` | Fetch wowtbc.gg's 34 dungeon tables (24h cache) into `forever/loot/wowtbc-dungeons.json` and rewrite `items-view.json` with gap items + drop sources. Run after `--ingest` |
| `--item <id>` | One item: build row (or wowtbc gap item), computed stats, provenance-stamped drop sources |
| `--search <text> [--limit N]` | Name search across the catalog plus wowtbc gap items (`data_source` marks the latter) |
| `--list-instances` | AtlasLoot instances and wowtbc dungeons, merged; new dungeons wowtbc has no data for read `status: unknown` |
| `--loot <instance>` | One instance: AtlasLoot's boss loot (`instance`) and wowtbc's boss/trash/quest tables (`wowtbc`) |
| `--item-sources <id>` | Where an item drops or is rewarded, from both sources, each stamped |
| `--audit-loot` | Cross-check AtlasLoot rows against the build, and wowtbc boss mappings/stats against both |

```sh
bun run src/forever.ts --build-info --pretty
bun run src/forever.ts --refresh-enums          # only needed when the enums change
bun run src/forever.ts --ingest                 # ~19k items, a couple of seconds
bun run src/forever.ts --ingest-wowtbc          # +1.3k gap items, boss/quest sources
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

## Icons, tooltip text, armor and weapon damage

Stage 2 adds the joins that make an item *readable* rather than merely correct.

**Icons.** `Item.IconFileDataID` joins `ManifestInterfaceData` to an icon file name. The catalog
stores the **name** (`inv_helmet_36`), never a URL, so it stays CDN-agnostic — see
[Icon art comes from a third-party CDN](#icon-art-comes-from-a-third-party-cdn).

**Effect text.** `Spell.Description_lang` with `$`-token placeholders **stripped, never
substituted**: `$s1`/`$o2` values, `$d` durations, `$t1` ticks, `${…}` maths blocks, `$<vars>`,
`$@spelldesc` cross-references and `$?…[…][…]` conditionals all come out, and nothing is put in
their place. "Increases Strength by $s1 for $d." becomes "Increases Strength by for." — terser than
the client, but never a number we made up. Zero of the build's 2,574 distinct descriptions keep a
stray token.

**Binding** comes from a new `ItemBonding` enum snapshot; **flavour** from
`ItemSparse.Description_lang`; **class/subclass names** from `ItemClass`/`ItemSubClass`; and
**allowable classes/races** by decoding the `AllowableClass` / `AllowableRace_0/1` bitmasks against
`ChrClasses` / `ChrRaces`. None of those names is hardcoded.

### Armor

Armor is not stored on the item — the engine computes it:

```
shield      armor = ItemArmorShield[ilvl].Quality_<quality>
otherwise   armor = round( ItemArmorTotal[ilvl].<material>
                         x ItemArmorQuality[ilvl].Qualitymod_<quality>
                         x ArmorLocation[inventoryType].<material>modifier )
```

The **material** is the item's own `ItemSubClass.DisplayName_lang` matched against
`ItemArmorTotal`'s column headers, so the join is data-to-data. An armor subclass with no matching
column (Miscellaneous, Libram, Idol, Totem, Cosmetic) carries no armor at all — `null` with *no*
`armor_unknown`, which is a different statement from "we could not work it out".

`ArmorLocation` is the piece that is easy to miss and expensive to omit: **without it every
non-chest slot computes at chest values.** Its `ID` is the `InventoryType`, and the two tables
disagree on one name — `ItemArmorTotal.Mail` is `ArmorLocation.Chainmodifier` — which is recorded
in a single map rather than spread through the code.

`InventoryType` also has **synonym ids that share one enum name**: 20 is "Chest" (the robe
variant) alongside 5, 22 is "Off Hand" alongside 14. Only the canonical id carries multipliers; the
synonym's `ArmorLocation` row is all zeroes. We fall back to the lowest id sharing the same
*snapshotted enum name*, which is why robes come out at their real value instead of 0. A slot whose
multiplier is genuinely zero (tabard, shirt) still reports no armor.

### Weapon damage and DPS

```
average = ItemDamage<curve>[ilvl].Quality_<quality> x speed        # speed = ItemDelay / 1000
min     = floor(average x (1 - DmgVariance / 2))
max     = round(average x (1 + DmgVariance / 2))
dps     = (min + max) / 2 / speed
```

The floor/round asymmetry and the DPS-from-rounded-bounds order are the client's, not ours.

**Which curve** is resolved from the data, never guessed:

1. `Wand` and `Thrown` by **subclass** — checked first, because both sit in a `Ranged`
   inventory slot and would otherwise silently take the ranged curve.
2. `Ranged` by **inventory type** (bows, guns, crossbows).
3. Otherwise one- or two-handed by inventory type, with `ItemSparse.Flags[1] & 0x200` — the
   caster-weapon bit — choosing `ItemDamageOneHandCaster` / `ItemDamageTwoHandCaster`. Nothing else
   distinguishes a caster dagger from a rogue dagger.

The table actually used is recorded on every weapon as `damage_curve`, so the choice is
inspectable rather than implicit.

Two facts about this build worth knowing: **no item carries the caster bit** (0 of 19,171), and the
caster curves are **numerically identical** to the physical ones at every item level and quality.
The caster branch is therefore correct but currently inert — and the DPS is right either way.

### Validation

Derived values are checked against **Blizzard's own Classic Era item API**
(`static-classic1x-us`), which is an independent source: it is not wago, not Wowhead, and not this
repo's maths. The unit tests in `src/lib/forever.test.ts` quote its numbers.

| Item | Derived | Blizzard |
|---|---|---|
| 12640 Lionheart Helm (plate head) | 565 armor | 565 armor |
| 14152 Robe of the Archmage (robe, synonym slot) | 96 armor | 96 armor |
| 15138 Onyxia Scale Cloak | 43 armor | 43 armor |
| 12584 Grand Marshal's Longsword (1H) | 138–207, 59.5 dps | 138–207, 59.5 dps |
| 18608 Benediction (2H caster staff) | 176–264, 73.3 dps | 176–264, 73.3 dps |
| 5240 Torchlight Wand (wand curve) | 14–27, 15.8 dps | 14–27, 15.8 dps |
| 5239 Blackbone Wand | 39–74, 35.3 dps | 39–74, 35.3 dps |

## The item browser

`--ingest` also writes **`forever/catalog/items-view.json`** — a slim projection carrying exactly
what a table and its tooltip need. Budgets, allocations, raw stat/quality/inventory-type ids and
prices are dropped, and absent fields are **omitted rather than emitted as `null`** (at 19k items
the repeated key names alone cost ~4MB). Unknown *reasons* survive: an omitted armor value keeps
saying why. The full `items.json` stays as-is for the CLI.

The view is the data source for the **Forever Items** tome space
(`.tome/spaces/forever-items.json` → `.tome/widgets/ForeverItemTable.tsx`):

```sh
bun run src/forever.ts --ingest     # writes items.json + items-view.json
tome space switch "Forever Items"
```

The widget owns its own sorting **and row windowing** — `DataGrid` does neither, and 19k `<img>`
rows at once is not an option. It renders ~35 rows around the scroll position regardless of how
far down you are. Name search, quality and slot facets, the sort column and the optional per-stat
column all persist through `savedState`.

**Drop sources are shown only with provenance.** After `--ingest-wowtbc`, a row carries
`drop_sources` (boss / trash / quest, each stamped with `source: wowtbc-warcraftforever`,
upstream's `discovered` flag and the source page's `fetched_at`) when the datamined tables have
one; a row without a source carries no field at all, and `meta` carries the
sentence saying what that absence means — the widget renders it verbatim in the footer and in the
tooltip of every source-less item. Gap items (no `ItemSparse` row) join the view with
`data_source: wowtbc-warcraftforever`, their `discovered` flag, and raw `upstream_stats` — never
`stats`, which means build-computed. A gap item whose upstream row gives no item level or
required level carries `null` there, never `0` (upstream omits `ilvl` on most rows).
`meta.gap_item_count` says how many.

### Icon art comes from a third-party CDN

This is the one place the repo reaches outside its own cached data. The catalog stores icon
*names*; the **widget** composes `https://wow.zamimg.com/images/wow/icons/large/<name>.jpg` — a
Wowhead-operated CDN. So:

- **The CLI and the catalog stay fully offline.** Only the tome view needs the network.
- The 2,873 distinct icon names in this build all resolve there (`200 image/jpeg`, with
  `access-control-allow-origin: *`), and tome serves no CSP, so the `<img>` loads.
- An item with no icon name renders a placeholder tile. It never borrows another item's art.
- **Escape hatch:** if the third-party dependency is unwanted, the ~2,873 icons are about 7MB and
  could be vendored under `forever/icons/`, with the widget pointing at a local path instead. That
  is a one-line change in `ForeverItemTable.tsx` (`ICON_BASE`).

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

AtlasLoot stays as the cross-check: it is the only source for raids and world bosses, and
`--audit-loot` compares it with wowtbc boss by boss. Nothing is retired.

## Datamined dungeon tables (wowtbc.gg)

`src/lib/forever-wowtbc.ts` ingests `wowtbc.gg/warcraftforever`'s dungeon loot tables — Gatsby
`page-data.json` files, one per dungeon under
`/page-data/warcraftforever/loot-tables/dungeons/<slug>/`, listed by the index
`.../dungeons/page-data.json` (34 dungeons, 9 `isNew`, **no raids**). Per dungeon it reads
`pageContext.gearData[]` (items) and `pageContext.loot[].bosses[]` / `.quests[]` (boss → item
ids, quest → reward ids); `setsData` and `dungeonLinks` are ignored.

```sh
bun run src/forever.ts --ingest                 # the build catalog first
bun run src/forever.ts --ingest-wowtbc --pretty # counts; re-runs within 24h hit the cache
```

**Fetching.** Through wago's `cachedFetch` (`src/lib/wago.ts`) with a browser `User-Agent`, into
`data/cache/wowtbc-forever/<slug>.page-data.json`, 24h TTL, sequential — 35 requests (index + 34)
at most once a day. `--no-cache` forces a refetch.

**Not committed.** Upstream publishes no license, so `forever/loot/wowtbc-dungeons.json` is
gitignored (that one file only — the rest of `forever/loot/` is the GPLv2 AtlasLoot extract).
Consequence: the gap items and wowtbc sources exist only after a local `--ingest-wowtbc`. Every
consumer degrades to "no wowtbc extract" (`hint`/`unknown` pointing at the command) without it.

### Output shape

`wowtbc-dungeons.json` is id-indexed and boss-keyed:

| Key | What it holds |
|---|---|
| `dungeons[<slug>]` | `name`, `levels`, `is_new`, `status` (`listed` / `unknown`), `bosses` (name → `item_ids`), `trash` (`item_ids` or `null`), `quests[]` (`name`, `level`, `faction`, `item_ids`, `new_item_ids`) |
| `items[<id>]` | Every upstream item, raw: `rarity`, `bind`, `slot`, `type`, `item_level`, `icon`, `set`, `upstream_stats`, `content`, `vanilla_drop_chance`, `sources[]`, `provenance` |
| `gap_items[<id>]` | Items the build has **no `ItemSparse` row** for, composed per field (below) |

- **Quests are modelled separately from bosses**, and upstream's `"Trash"` pseudo-boss becomes
  `trash`, never an encounter.
- **No fabrication.** A dungeon upstream lists with no items, bosses or quests gets
  `status: unknown` plus an `unknown` reason. As of 2026-09-23 that is **7 of the 9 new
  dungeons** — only Hall of Thanes and Ruins of Lordaeron have data; Shaper's Terrace, City of
  Dalaran, Excavation Site: Wetlands, The Drowned City, Krol'dok Stronghold, Alcaz Prison and
  Blackmaw Hold are unknown.

### Authority, field by field

- **For an item the build has (`ItemSparse` row), wago is authoritative for every field.** wowtbc
  contributes only the drop/quest source — and its stats as a cross-check (`--audit-loot`
  `wowtbc.stat_crosscheck`), never as a value. They matched 16/16 on the overlap; since both are
  computed from the same client data, that is consistency, not independent evidence.
- **For a gap item, wago's `Item` table still wins where it has a value** — `class_id`,
  `subclass_id`, class/subclass names, `inventory_type`, and `icon` (from `IconFileDataID`, when
  non-zero) — and wago's `ItemSet` table wins for set membership. wowtbc fills only what the build
  lacks: `name`, `item_level`, `required_level` (`other_stats.min_level`), `quality`, `binding`.
  `field_sources` on every gap item records the winner per field (`wago-item`, `wago-itemset`,
  `wowtbc-warcraftforever`).
- **Upstream stat names do not map onto `ItemStatType`** (`spirit` is `SPIRIT_UNUSED`;
  `spell_damage` / `spell_healing` have no clean match), so they stay raw under `upstream_stats`
  (`primary` / `secondary` / `special` / `other`, verbatim — `secondary` can hold free text such as
  `use_1`). Gap items have no `stats`, `armor` or `weapon` field. The only declared name table is
  `CROSSCHECK_STAT_MAP` (strength/agility/stamina/intellect), used solely for the cross-check.
  `rarity` → `ItemQuality` and `bind` → `ItemBonding` go through declared tables
  (`RARITY_TO_QUALITY_ID`, `BIND_TO_BONDING_ID`) onto the snapshotted enum names.

### Provenance

Every wowtbc-sourced row carries `provenance: { source: "wowtbc-warcraftforever", discovered,
fetched_at }`:

- `discovered` is **tri-state** — `true`, `false`, or `null` when upstream omits the key. In the
  2026-09-23 fetch: 334 true, 0 false, 994 null.
- `fetched_at` is the page's cache mtime; `meta.fetched_at` is the oldest of them.
- This is **datamined community data**: never presented as build-derived, never as an observed
  drop.

**Drop chances are Vanilla-observed.** Upstream's `drop_chance` appears only on reused-Vanilla
items; it is carried as `vanilla_drop_chance` and **only when `content` is `vanilla`**. An item
listed in several dungeons is `forever-new` if *any* listing makes it so, and then loses its
drop chance. An item is
`forever-new` if its dungeon is new, upstream flags it in a quest's `new` list, or its id is at or
above `FOREVER_NEW_ITEM_ID_FLOOR` (250000 — the ingest notes any upstream-new id below it). New
items in reused dungeons (e.g. 273289 Ogre Loincloth ← Rhahk'Zor) therefore never show a rate, and
a quest reward never carries one — on `--loot`, `--item-sources` and `--item` alike. `--loot` on
an instance wowtbc does not cover (raids, world bosses) says so under `wowtbc.unknown` rather
than returning a bare `null`.

### Counts (build `1.60.1.69977`, fetched 2026-09-23)

| | |
|---|---|
| upstream items | 1,328 |
| gap items filled (no `ItemSparse` row) | **1,311** — 1,223 Vanilla, 88 Forever-new |
| bosses / boss → item mappings | 213 / 870 |
| trash mappings | 385 |
| quests / quest → reward mappings | 103 / 232 |
| AtlasLoot unresolved rows now corroborated | vanilla 1,289 of 2,048; forever-new **46 of 46** |
| boss mappings vs AtlasLoot (200 matched bosses) | 797 agree, 12 only wowtbc, 88 only AtlasLoot |

wowtbc lists uncommon-and-better only (57 Deadmines items vs AtlasLoot's 59).

## Known data-source limits

- **The item catalog is not a complete item list.** wago's `ItemSparse` export for Forever
  builds carries ~19.2k rows while its `Item` table lists 31,675 ids — ~12.5k items ship with no
  name/stats row (e.g. 14149 *Subterranean Cape*, live in game, absent from the export across
  builds `.69876`–`.69977`). `--audit-loot` quantifies this: around a third of reused-Vanilla loot
  rows resolve to a build item. `--ingest-wowtbc` fills 1,311 of the gap for dungeon loot; the rest
  still report `unknown` rather than silently vanishing.
- **`forever-new` loot rows fail to resolve only because the build has no `ItemSparse` row** for
  them, not because the ids are speculative: a second datamine (wowtbc) lists all 46 of them,
  with names and bosses. They stay flagged `forever-new` (datamined, not observed), and resolve by
  name through the wowtbc gap items.
- **Observed drop rates for Forever do not exist yet.** `drop_rates` in the extract are
  upstream's *Vanilla*-observed percentages and are never inferred for new content.
- **No durability.** This build's `ItemSparse` has no durability column at all, so durability is
  omitted rather than approximated.
- **No damage school name.** `ItemSparse.DamageType` is carried as a raw `damage_type_id`. wago's
  DBD metadata publishes no `DamageType` enum for this build, and a school name from memory would
  be exactly the guess this path refuses to make.
- **~5% of items have no icon.** 18,246 of 19,171 resolve. The rest have `IconFileDataID = 0` in
  the build's own `Item` rows — not a lookup failure (only 25 of 31,675 ids are missing from
  `ManifestInterfaceData`). They render a placeholder tile, never another item's art.

## Related

- `forever/README.md` — directory layout
- `src/lib/forever-wowtbc.ts` — the wowtbc ingest, authority and provenance rules
- `.tome/widgets/ForeverItemTable.tsx` — the browser widget; `lib/quality.ts` and
  `lib/ItemTooltip.tsx` are shared with the retail Paperdoll and ilvl chart
- `docs/loot-tools.md` — the retail Journal loot path (deliberately separate)
