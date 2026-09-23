# WoW Data — Claude Reference

CLI tools for querying World of Warcraft game data and character profiles via the Blizzard API.

## API usage

Use the `wow-api` skill before interacting with any Blizzard API tools. It contains full documentation for all available tools, flags, and workflows.

## Shared code

- `src/api.ts` — `WoWAPI` class with all Blizzard API methods
- `src/connection.ts` — Vault → env → Keychain credential chain; mints OAuth access tokens on demand (see `docs/credentials.md`)
- `src/utils.ts` — Flag parsing and output helpers

## Presenting data

Tool output is raw JSON. When presenting results to the user, format them into readable markdown — use headers, tables, bullet lists, and bold/italic for emphasis. Don't dump raw JSON into the chat.

## Important constraints

- **Credentials**: Vault (AppRole via `./run` wrapper) → env vars → macOS Keychain. Agents must never access `~/.vault-tokens/` or Vault directly.
- **Tokens**: game-data access tokens are minted on demand from `client_id`/`client_secret` and cached in memory — never manually refreshed. Only user-scoped `/profile/user/...` (`src/account.ts`) needs `./run src/oauth.ts --profile`. Never print tokens or secrets.
- All output is JSON. Pipe to `jq` for filtering.
