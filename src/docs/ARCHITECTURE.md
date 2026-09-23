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
   └── Fetches kv/data/wow/api → client_id, client_secret (+ optional access_token)

2. Environment Variables (fallback)
   ├── BNET_CLIENT_ID
   ├── BNET_CLIENT_SECRET
   └── BNET_ACCESS_TOKEN (optional)

3. macOS Keychain (token only, last resort)
   └── security find-generic-password -s wow-api-bnet -a bnet
```

## Access Tokens

Tokens are **derived, not stored**. `getAccessToken()` in `src/connection.ts` mints one
on demand from `client_id`/`client_secret` via the OAuth client-credentials grant
(`POST https://oauth.battle.net/token`; `www.battlenet.com.cn/oauth/token` for `cn`) and
caches it in memory, per region, for the process lifetime. Concurrent mints are collapsed
into a single request.

A pre-stored `access_token` is only a fallback for when minting is impossible. `makeRequest`
retries once on `401` with a forced re-mint, so an expired token self-heals.

The exception is user-scoped `/profile/user/...`, which needs an authorization-code token
with the `wow.profile` scope. Those calls request the stored token explicitly and fail with
a pointer to `./run src/oauth.ts --profile` rather than a bare 401.

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
