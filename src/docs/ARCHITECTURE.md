# Architecture

## Overview

```
./run wrapper (injects Vault credentials)
  └── bun run src/<tool>.ts
        ├── src/utils.ts      (flag parsing, JSON output)
        ├── src/connection.ts  (credential chain)
        └── src/api.ts         (WoWAPI class)
              └── Blizzard API (https://{region}.api.blizzard.com)
```

## Credential Chain

```
1. Vault AppRole (via ./run wrapper)
   ├── VAULT_ROLE_ID + VAULT_SECRET_ID → Vault login
   └── Fetches kv/data/wow/api → access_token, client_id, client_secret

2. Environment Variables (fallback)
   ├── BNET_ACCESS_TOKEN
   ├── BNET_CLIENT_ID
   └── BNET_CLIENT_SECRET

3. macOS Keychain (token only, last resort)
   └── security find-generic-password -s wow-api-bnet -a bnet
```

The `./run` bash wrapper reads `~/.vault-tokens/wow-api` and injects the Vault role/secret IDs into the child process environment. This keeps secrets out of the codebase and invisible to Claude Code agents (enforced by `.claude/settings.json` deny rules).

## WoWAPI Class

`src/api.ts` wraps all Blizzard API endpoints. It uses the native `fetch()` API (no dependencies). All methods return parsed JSON.

**Namespaces:**
- `static-{region}` — Used for most endpoints (items, professions, recipes, crafting)
- `dynamic-{region}` — Used for auction house data (changes frequently)

## Tool Pattern

Each tool in `src/` follows the same pattern:
1. Parse flags via `getArg()` / `hasFlag()` / `requireArg()` from `src/utils.ts`
2. Create a `WoWAPI` instance (triggers credential resolution)
3. Call the appropriate API method
4. Output JSON to stdout via `output(data, pretty)`
5. Errors go to stderr as JSON: `{ "error": "message" }`

## Project Layout

```
wow-data/
├── run                    # Vault wrapper script
├── src/
│   ├── api.ts             # WoWAPI class (all Blizzard API methods)
│   ├── connection.ts      # Credential chain (Vault → env → Keychain)
│   ├── utils.ts           # Flag parsing, output helpers
│   ├── search.ts          # Item search
│   ├── item.ts            # Item data
│   ├── item-media.ts      # Item media
│   ├── professions.ts     # Professions index/detail
│   ├── profession-tier.ts # Profession skill tier
│   ├── recipe.ts          # Recipe details
│   ├── recipe-media.ts    # Recipe media
│   ├── item-class.ts      # Item classes/subclasses
│   ├── item-set.ts        # Item sets
│   ├── commodities.ts     # AH commodity data
│   ├── crafting.ts        # Modified crafting system
│   ├── oauth.ts           # OAuth token refresh server
│   └── docs/
│       ├── SETUP.md       # Setup guide
│       ├── CLI_REFERENCE.md # Full tool reference
│       └── ARCHITECTURE.md  # This file
├── gear_prog/             # Gear progression charts (Python, separate)
├── CLAUDE.md              # Claude Code reference
├── package.json
└── tsconfig.json
```
