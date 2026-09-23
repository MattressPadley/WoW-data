# WoW Forever data

**Forever** is Blizzard's permanently-expanding Vanilla-content product — Vanilla content
running on the retail engine (beta since 2026-09-17, launch 2026-11-04).

Always call it **Forever**, never "Classic". The one exception is the wago product key
`wow_classic_beta`, which is Blizzard's literal API parameter and stays verbatim in code.

This directory is a top-level section, deliberately **not** `seasons/forever/`: `SeasonData`
and `seasons/current.yaml` are retail-shaped (upgrade tracks, crest suffixes, M+ ranges) and
registering Forever there would risk breaking retail tools.

## Layout

| Path | Checked in | What it is |
|---|---|---|
| `enums/*.json` | yes | DBD enum snapshots (`ItemStatType`, `ItemQuality`, `InventoryType`) captured from wago's `dbdMeta`, with the build they came from |
| `loot/dungeon-loot.json` | yes | Offline extract of AtlasLootClassic's reused-Vanilla loot tables |
| `loot/LICENSE`, `loot/SOURCE.md` | yes | Upstream GPLv2 text and the exact commit the extract came from |
| `catalog/items.json` | **no** (gitignored) | Ingested item catalog for one build — regenerable in seconds, rotates ~weekly |

## Where the data comes from

The Blizzard API is **dark** for the Forever beta, and Forever's loot *sources* are
server-side (absent from the client). So:

- **Items and computed stats** — wago.tools DB2 exports for the current Forever build.
  Stat values are genuinely computable: `StatPercentEditor × RandPropPoints ÷ 10000`,
  because Forever runs the modern budget system.
- **Reused-Vanilla loot** — vendored offline extract (see `loot/SOURCE.md`).
- **New-content loot** — *not known*. Upstream datamines it; we carry those rows flagged
  `provenance: forever-new` / `loot_status: unknown-new-content` and never assert them.

Nothing here constructs `WoWAPI` or touches `src/lib/dungeon-loot.ts` — see
`docs/forever-data.md` for why.

## Usage

See `docs/forever-data.md`. Quick start:

```sh
bun run src/forever.ts --build-info --pretty
bun run src/forever.ts --refresh-enums
bun run src/forever.ts --ingest
bun run src/forever.ts --item 12640 --pretty
```
