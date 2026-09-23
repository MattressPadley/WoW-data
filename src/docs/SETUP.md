# Setup Guide

## Prerequisites

- [Bun](https://bun.sh/) runtime
- A [Blizzard Developer](https://develop.battle.net/) account with an API client registered

## Installation

```bash
cd /Users/mhadley/Dev/wow-data
bun install
```

## Credentials

The tools use a three-tier credential chain:

### 1. Vault (recommended)

Store credentials at `kv/data/wow/api` with keys:
- `client_id` — OAuth client ID **(required)**
- `client_secret` — OAuth client secret **(required)**
- `access_token` — optional. Only needed for the user-scoped `/profile/user/...`
  endpoints (`src/account.ts`), which need an authorization-code token. Game-data
  tokens are minted on demand from `client_id`/`client_secret` and are never read
  from here.

Create an AppRole for the CLI:
```bash
# Create the role (one-time)
vault write auth/approle/role/wow-api-credentials \
  token_ttl=10m token_max_ttl=30m

# Get the role ID
vault read auth/approle/role/wow-api-credentials/role-id

# Generate a secret ID
vault write -f auth/approle/role/wow-api-credentials/secret-id

# Store the secret ID locally
echo "<secret_id>" > ~/.vault-tokens/wow-api
```

Update the `VAULT_ROLE_ID` in the `./run` script with your role ID.

### 2. Environment Variables (fallback)

Set in a `.env` file or shell:
```bash
BNET_CLIENT_ID=<your_client_id>         # required — tokens are minted from these
BNET_CLIENT_SECRET=<your_client_secret>
BNET_ACCESS_TOKEN=<your_token>          # optional; user-scoped endpoints only
```

### 3. macOS Keychain (token only)

```bash
security add-generic-password -s wow-api-bnet -a bnet -w <your_access_token>
```

Keychain supplies a stored token only. Since game-data tokens are now minted on
demand, this is a fallback for when no `client_id`/`client_secret` is available.

## Token Refresh

**Game-data tokens refresh themselves — there is nothing to do.**

`src/connection.ts` mints an access token on demand via the OAuth client-credentials
grant (`POST https://oauth.battle.net/token`) using `client_id`/`client_secret`, and
caches it in memory for the life of the process. A stored `access_token` is never
treated as the source of truth, and any `401` triggers a transparent re-mint.

`./run src/oauth.ts` still exists to mint a token and write it back to Vault, but it
is no longer required for day-to-day use.

### User-scoped endpoints

`/profile/user/...` (i.e. `src/account.ts`) needs an authorization-code token with the
`wow.profile` scope, which client credentials cannot mint. Refresh that one manually:

```bash
./run src/oauth.ts --profile
# Visit http://sophie.home:8000/auth in your browser; the token is stored in Vault
```

## Running Tools

```bash
./run src/<tool>.ts [flags]
```

See `CLAUDE.md` or `CLI_REFERENCE.md` for the full tool list.
