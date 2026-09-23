# Source and attribution — forever/loot/dungeon-loot.json

`dungeon-loot.json` is a derivative work of **AtlasLootClassic**, extracted offline.

| | |
|---|---|
| Upstream repo | https://github.com/HoliestWoW/AtlasLootClassic.git |
| Commit | `9e96553a11ce3534d0af0ed54995ec5f5427f6b4` |
| Files used | `AtlasLootClassic_DungeonsAndRaids/data.lua`, `AtlasLootClassic_DungeonsAndRaids/droprate.lua` |
| Upstream license | GPL-2.0 — full text in `LICENSE` beside this file |
| Extractor | `scripts/extract-atlasloot.ts` + `scripts/atlasloot-extract.lua` |

## How it was produced

The upstream data is addon Lua written against AtlasLoot's module API, so it is
evaluated under a stub of that API rather than pattern-matched. The module is
loaded twice — with AtlasLoot's `IS_FOREVER` off and on — and the results are
diffed, which is what `provenance` records:

- `vanilla` — present in both passes: reused live-Vanilla loot, trustworthy.
- `forever-new` — only in the Forever pass: upstream datamining of new content,
  **unverified**. Bosses made only of such rows are `loot_status:
  unknown-new-content`.

Instance and boss ids that upstream leaves as `0` placeholders are emitted as
`null` with a reason in `unknown`, never as `0`.

## Licensing note

A checked-in extract of GPLv2 data is a derivative work. That is fine while this
repository is private; if it is ever published, the repository inherits GPLv2
obligations. Raise this at publish time.

## Regenerating

```sh
bun run scripts/extract-atlasloot.ts
```

Requires `luajit` (LuaJIT 2.1, for `getfenv`) on PATH.
