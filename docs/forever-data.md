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
| `--ingest [--build X] [--no-cache]` | Ingest the item catalog into `forever/catalog/items.json` (+ `items-view.json`) |
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

**The view never asserts a drop source.** It carries no `drop_sources` field at all; its `meta`
carries the sentence explaining why, and the widget renders that sentence verbatim in the footer
and in every tooltip. Use `--item-sources <id>` for the vendored reused-Vanilla extract.

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
- `.tome/widgets/ForeverItemTable.tsx` — the browser widget; `lib/quality.ts` and
  `lib/ItemTooltip.tsx` are shared with the retail Paperdoll and ilvl chart
- `docs/loot-tools.md` — the retail Journal loot path (deliberately separate)
