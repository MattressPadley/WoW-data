# WoW Data — Claude Reference

CLI tools for querying World of Warcraft game data via the Blizzard API.

## Running tools

```bash
./run src/<tool>.ts [flags]
```

The `run` wrapper injects Vault credentials into the child process. All tools output **JSON by default**. Add `--pretty` for human-readable output.

## Available tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `search.ts` | Search items by name | `--name` (required), `--limit`, `--page`, `--pretty` |
| `item.ts` | Get item data by ID | `--id` (required), `--pretty` |
| `item-media.ts` | Get item media/icon | `--id` (required), `--pretty` |
| `item-class.ts` | List/get item classes | `--id`, `--subclass`, `--pretty` |
| `item-set.ts` | List/get item sets | `--id`, `--pretty` |
| `professions.ts` | List professions or get one | `--id`, `--media`, `--pretty` |
| `profession-tier.ts` | Get profession skill tier | `--profession` (required), `--tier` (required), `--pretty` |
| `recipe.ts` | Get recipe details | `--id` (required), `--pretty` |
| `recipe-media.ts` | Get recipe media/icon | `--id` (required), `--pretty` |
| `crafting.ts` | Modified crafting queries | `--categories`, `--category-id`, `--slot-types`, `--slot-type-id`, `--pretty` |
| `commodities.ts` | Fetch AH commodity data | `--pretty` |
| `auctions.ts` | Get per-realm auction data | `--realm` (required), `--pretty` |
| `achievement.ts` | List/get achievements or categories | `--id`, `--media`, `--categories`, `--category-id`, `--pretty` |
| `azerite-essence.ts` | List/get Azerite Essences | `--id`, `--media`, `--pretty` |
| `connected-realm.ts` | List/get connected realms | `--id`, `--pretty` |
| `covenant.ts` | Query Shadowlands covenant data | `--id`, `--media`, `--soulbinds`, `--soulbind-id`, `--conduits`, `--conduit-id`, `--pretty` |
| `creature.ts` | Query creature data | `--id`, `--families`, `--family-id`, `--media`, `--types`, `--type-id`, `--display-media`, `--pretty` |
| `guild-crest.ts` | Query guild crest components | `--border-id`, `--emblem-id`, `--pretty` |
| `heirloom.ts` | List/get heirlooms | `--id`, `--pretty` |
| `journal.ts` | Query journal data | `--expansions`, `--expansion-id`, `--encounters`, `--encounter-id`, `--instances`, `--instance-id`, `--media`, `--pretty` |
| `keystone-affix.ts` | List/get M+ affixes | `--id`, `--media`, `--pretty` |
| `mount.ts` | List/get mounts | `--id`, `--pretty` |
| `mythic-keystone.ts` | Query M+ data | `--dungeons`, `--dungeon-id`, `--periods`, `--period-id`, `--seasons`, `--season-id`, `--pretty` |
| `mythic-leaderboard.ts` | Query M+ leaderboards | `--realm` (required), `--dungeon`, `--period`, `--pretty` |
| `mythic-raid-leaderboard.ts` | Get raid Hall of Fame | `--raid` (required), `--faction` (required), `--pretty` |
| `pet.ts` | Query battle pet data | `--id`, `--media`, `--abilities`, `--ability-id`, `--pretty` |
| `playable-class.ts` | List/get playable classes | `--id`, `--media`, `--pvp-talent-slots`, `--pretty` |
| `playable-race.ts` | List/get playable races | `--id`, `--pretty` |
| `playable-spec.ts` | List/get specializations | `--id`, `--media`, `--pretty` |
| `power-type.ts` | List/get power types | `--id`, `--pretty` |
| `pvp-season.ts` | Query PvP season data | `--id`, `--leaderboards`, `--leaderboard` (bracket), `--rewards`, `--pretty` |
| `pvp-tier.ts` | List/get PvP tiers | `--id`, `--media`, `--pretty` |
| `quest.ts` | Query quest data | `--id`, `--categories`, `--category-id`, `--areas`, `--area-id`, `--types`, `--type-id`, `--pretty` |
| `realm.ts` | List/get realms | `--slug`, `--pretty` |
| `region.ts` | List/get regions | `--id`, `--pretty` |
| `reputation.ts` | Query reputation data | `--id`, `--tiers`, `--tier-id`, `--pretty` |
| `spell.ts` | Get spell data | `--id` (required), `--media`, `--pretty` |
| `talent.ts` | Query talent data | `--tree-id`, `--spec-id`, `--talents`, `--id`, `--pvp-talents`, `--pvp-talent-id`, `--pretty` |
| `tech-talent.ts` | Query tech talent data | `--id`, `--media`, `--trees`, `--tree-id`, `--pretty` |
| `title.ts` | List/get titles | `--id`, `--pretty` |
| `toy.ts` | List/get toys | `--id`, `--pretty` |
| `wow-token.ts` | Get WoW Token price | `--pretty` |
| `oauth.ts` | OAuth token refresh server | (starts server on :8000) |

All tools accept `--region` (default: `us`).

## Important constraints

- **Credentials**: Vault (AppRole via `./run` wrapper) → env vars → macOS Keychain. Agents must never access `~/.vault-tokens/` or Vault directly.
- All output is JSON. Pipe to `jq` for filtering.

## Shared code

- `src/api.ts` — `WoWAPI` class with all Blizzard API methods
- `src/connection.ts` — Vault → env → Keychain credential chain
- `src/utils.ts` — Flag parsing and output helpers

## Example workflows

```bash
# Search for an item
./run src/search.ts --name "Spark of Ingenuity" --pretty

# Get item details
./run src/item.ts --id 190453 --pretty

# List all professions
./run src/professions.ts --pretty

# Get Blacksmithing Khaz Algar tier
./run src/profession-tier.ts --profession 164 --tier 2871 --pretty

# Get recipe details
./run src/recipe.ts --id 12345 --pretty

# Check AH commodity prices
./run src/commodities.ts | jq '.auctions[:5]'

# Modified crafting categories
./run src/crafting.ts --categories --pretty

# Get WoW Token price
./run src/wow-token.ts --pretty

# List mounts
./run src/mount.ts --pretty

# Get a specific achievement
./run src/achievement.ts --id 6 --pretty

# List connected realms
./run src/connected-realm.ts --pretty

# Get realm info by slug
./run src/realm.ts --slug tichondrius --pretty

# Get per-realm auctions
./run src/auctions.ts --realm 11 --pretty | jq '.auctions[:5]'

# List M+ dungeons
./run src/mythic-keystone.ts --dungeons --pretty

# Get spell details
./run src/spell.ts --id 196607 --pretty

# List playable classes
./run src/playable-class.ts --pretty

# Get PvP season leaderboard
./run src/pvp-season.ts --id 33 --leaderboard 3v3 --pretty

# Mythic raid Hall of Fame
./run src/mythic-raid-leaderboard.ts --raid "nerubar-palace" --faction horde --pretty
```
