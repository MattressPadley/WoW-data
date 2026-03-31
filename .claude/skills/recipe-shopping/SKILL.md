---
name: recipe-shopping
description: Get recipe reagent lists with quantities and generate shopping lists with auction house prices for WoW crafting recipes. Handles both modern (Dragonflight+) and legacy recipes. Uses recipe-reagents and recipe-shopping tools.
---

# WoW Recipe & Shopping List Tools

Compound tools that resolve recipe reagents (via Blizzard API + wago.tools DB2 CSVs) and price them against auction house data. For raw profession/recipe API access, use the `wow-api` skill.

## Running tools

All tools live in `/Users/mhadley/Dev/wow-data` and are run via:

```bash
./run src/<tool>.ts [flags]
```

The `./run` wrapper handles credentials automatically. All tools output **JSON by default**. Add `--pretty` for formatted output. All tools accept `--region` (default: `us`) and `--pretty`.

## Tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `recipe-reagents.ts` | Get recipe reagent items + quantities | `--id` (required), `--no-cache` |
| `recipe-shopping.ts` | Shopping list with AH prices for a recipe | `--id` (required), `--realm` (optional), `--no-cache` |

## Workflows

### Get recipe reagents
```bash
# Modern recipe (Dragonflight+) — resolves modified crafting slots to items + quantities
./run src/recipe-reagents.ts --id 53044 --pretty

# Old recipe — resolves classic SpellReagents
./run src/recipe-reagents.ts --id 42363 --pretty

# Force refresh cached DB2 data (cached 24h by default)
./run src/recipe-reagents.ts --id 53044 --no-cache --pretty

# Shopping list with AH prices (cheapest options per slot + grand total)
./run src/recipe-shopping.ts --id 53044 --pretty

# Include realm auctions for non-commodity items
./run src/recipe-shopping.ts --id 53044 --realm 11 --pretty
```

## Important

- Credentials are handled by the `./run` wrapper — never access `~/.vault-tokens/` or print environment variables
- Output is JSON — use `jq` for filtering
- Run from the `/Users/mhadley/Dev/wow-data` directory
