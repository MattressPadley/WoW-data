---
name: wow-api
description: Query World of Warcraft game data via the Blizzard API. Covers all Game Data API categories plus character Profile API: items, professions, recipes, auctions, achievements, creatures, mounts, pets, talents, PvP, M+, quests, realms, spells, character profiles, equipment, collections, and more.
---

# WoW API Skill

Query World of Warcraft game data using CLI tools that wrap the Blizzard API.

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All tools output **JSON by default**. Add `--pretty` for formatted output. All tools accept `--region` (default: `us`) and `--pretty`.

## Tools

### Items & Auction House

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `search.ts` | Search items by name | `--name` (required), `--limit`, `--page` |
| `item.ts` | Get item data by ID | `--id` (required) |
| `item-media.ts` | Get item media/icon | `--id` (required) |
| `item-class.ts` | List/get item classes | `--id`, `--subclass` |
| `item-set.ts` | List/get item sets | `--id` |
| `commodities.ts` | Fetch AH commodity data | (none) |
| `auctions.ts` | Get per-realm auction data | `--realm` (required) |

### Professions & Crafting

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `professions.ts` | List professions or get one | `--id`, `--media` |
| `profession-tier.ts` | Get profession skill tier | `--profession` (required), `--tier` (required) |
| `recipe.ts` | Get recipe details | `--id` (required) |
| `recipe-media.ts` | Get recipe media | `--id` (required) |
| `crafting.ts` | Modified crafting queries | `--categories`, `--category-id`, `--slot-types`, `--slot-type-id` |

### Characters & Classes

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `playable-class.ts` | List/get playable classes | `--id`, `--media`, `--pvp-talent-slots` |
| `playable-race.ts` | List/get playable races | `--id` |
| `playable-spec.ts` | List/get specializations | `--id`, `--media` |
| `power-type.ts` | List/get power types | `--id` |
| `title.ts` | List/get titles | `--id` |

### Talents

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `talent.ts` | Query talent trees & talents | `--tree-id`, `--spec-id`, `--talents`, `--id`, `--pvp-talents`, `--pvp-talent-id` |
| `tech-talent.ts` | Query tech talents | `--id`, `--media`, `--trees`, `--tree-id` |

### Collections

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `mount.ts` | List/get mounts | `--id` |
| `pet.ts` | Query battle pets & abilities | `--id`, `--media`, `--abilities`, `--ability-id` |
| `toy.ts` | List/get toys | `--id` |
| `heirloom.ts` | List/get heirlooms | `--id` |

### Achievements & Quests

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `achievement.ts` | List/get achievements | `--id`, `--media`, `--categories`, `--category-id` |
| `quest.ts` | Query quests | `--id`, `--categories`, `--category-id`, `--areas`, `--area-id`, `--types`, `--type-id` |
| `reputation.ts` | Query reputation data | `--id`, `--tiers`, `--tier-id` |

### Creatures & Journal

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `creature.ts` | Query creature data | `--id`, `--families`, `--family-id`, `--media`, `--types`, `--type-id`, `--display-media` |
| `journal.ts` | Query journal data | `--expansions`, `--expansion-id`, `--encounters`, `--encounter-id`, `--instances`, `--instance-id`, `--media` |

### Mythic+ & Raiding

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `mythic-keystone.ts` | Query M+ data | `--dungeons`, `--dungeon-id`, `--periods`, `--period-id`, `--seasons`, `--season-id` |
| `mythic-leaderboard.ts` | Query M+ leaderboards | `--realm` (required), `--dungeon`, `--period` |
| `mythic-raid-leaderboard.ts` | Get raid Hall of Fame | `--raid` (required), `--faction` (required) |
| `keystone-affix.ts` | List/get M+ affixes | `--id`, `--media` |

### PvP

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `pvp-season.ts` | Query PvP seasons | `--id`, `--leaderboards`, `--leaderboard` (bracket), `--rewards` |
| `pvp-tier.ts` | List/get PvP tiers | `--id`, `--media` |

### Realms & Regions

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `realm.ts` | List/get realms | `--slug` |
| `region.ts` | List/get regions | `--id` |
| `connected-realm.ts` | List/get connected realms | `--id` |

### Spells & Miscellaneous

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `spell.ts` | Get spell data | `--id` (required), `--media` |
| `azerite-essence.ts` | List/get Azerite Essences | `--id`, `--media` |
| `covenant.ts` | Query Shadowlands covenants | `--id`, `--media`, `--soulbinds`, `--soulbind-id`, `--conduits`, `--conduit-id` |
| `guild-crest.ts` | Query guild crest components | `--border-id`, `--emblem-id` |
| `wow-token.ts` | Get WoW Token price | (none) |

### Character Profile

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `character.ts` | Query character profile data | `--realm` (required), `--name` (required), plus endpoint flags below |

**Endpoint flags** (use one at a time with `--realm` and `--name`):

| Flag | Sub-flag | Description |
|------|----------|-------------|
| *(none)* | | Profile summary |
| `--status` | | Character status |
| `--equipment` | | Equipped items |
| `--achievements` | | Achievement summary |
| `--achievements` | `--stats` | Achievement statistics |
| `--appearance` | | Visual customization |
| `--collections` | | All collections |
| `--collections` | `--mounts` | Mount collection |
| `--collections` | `--pets` | Pet collection |
| `--collections` | `--toys` | Toy collection |
| `--collections` | `--heirlooms` | Heirloom collection |
| `--collections` | `--transmogs` | Transmog collection |
| `--encounters` | | All encounters |
| `--encounters` | `--dungeons` | Dungeon encounters |
| `--encounters` | `--raids` | Raid encounters |
| `--hunter-pets` | | Hunter pet roster |
| `--media` | | Character artwork |
| `--mythic-keystone` | | M+ profile |
| `--mythic-keystone` | `--season <id>` | M+ season details |
| `--professions` | | Profession progress |
| `--pvp` | | PvP summary |
| `--pvp` | `--bracket <bracket>` | PvP bracket (2v2, 3v3, rbg) |
| `--quests` | | Active quests |
| `--quests` | `--completed` | Completed quests |
| `--reputations` | | Faction standings |
| `--soulbinds` | | Soulbind selections |
| `--specializations` | | Spec builds |
| `--statistics` | | Combat statistics |
| `--titles` | | Earned titles |

### Account Profile (Protected)

Requires authorization code token: `./run src/oauth.ts --profile`

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `account.ts` | Account-level profile data | `--protected-character`, `--realm-id`, `--character-id` |

## Common workflows

### Find an item
```bash
./run src/search.ts --name "Enchanted Wyrm's Crest" --limit 5
./run src/item.ts --id <item_id> --pretty
```

### Explore a profession
```bash
./run src/professions.ts --pretty
./run src/professions.ts --id 164 --pretty
./run src/profession-tier.ts --profession 164 --tier 2871 --pretty
./run src/recipe.ts --id <recipe_id> --pretty
```

### Check auction house
```bash
# Region-wide commodities
./run src/commodities.ts | jq '.auctions | map(select(.item.id == 190453))'
# Per-realm auctions (find realm ID via connected-realm.ts)
./run src/connected-realm.ts --pretty
./run src/auctions.ts --realm 11 --pretty | jq '.auctions[:5]'
```

### Explore M+ data
```bash
./run src/mythic-keystone.ts --dungeons --pretty
./run src/mythic-keystone.ts --seasons --pretty
./run src/mythic-leaderboard.ts --realm 11 --dungeon 375 --period 1 --pretty
```

### Browse game content
```bash
./run src/mount.ts --id 6 --pretty
./run src/pet.ts --id 39 --pretty
./run src/achievement.ts --id 6 --pretty
./run src/spell.ts --id 196607 --pretty
./run src/playable-class.ts --pretty
./run src/talent.ts --tree-id 786 --spec-id 262 --pretty
```

### PvP & WoW Token
```bash
./run src/pvp-season.ts --id 33 --leaderboard 3v3 --pretty
./run src/wow-token.ts --pretty
./run src/mythic-raid-leaderboard.ts --raid "nerubar-palace" --faction horde --pretty
```

### Character profile
```bash
./run src/character.ts --realm tichondrius --name thrall --pretty
./run src/character.ts --realm tichondrius --name thrall --equipment --pretty
./run src/character.ts --realm tichondrius --name thrall --mythic-keystone --pretty
./run src/character.ts --realm tichondrius --name thrall --mythic-keystone --season 12 --pretty
./run src/character.ts --realm tichondrius --name thrall --collections --mounts --pretty
./run src/character.ts --realm tichondrius --name thrall --encounters --raids --pretty
./run src/character.ts --realm tichondrius --name thrall --pvp --bracket 3v3 --pretty
./run src/character.ts --realm tichondrius --name thrall --professions --pretty
./run src/character.ts --realm tichondrius --name thrall --statistics --pretty
```

### Account profile (protected)
```bash
# First get an authorization code token
./run src/oauth.ts --profile
# Then query account data
./run src/account.ts --pretty
```

## Related skills

- **gear-upgrades** — Gear analysis and dungeon upgrade finder (gear-check, dungeon-loot, upgrades tools)
- **recipe-shopping** — Recipe reagent resolution and AH shopping lists (recipe-reagents, recipe-shopping tools)

## Important

- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
