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
- `access_token` — Bearer token for API requests
- `client_id` — OAuth client ID (for token refresh)
- `client_secret` — OAuth client secret (for token refresh)

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
BNET_ACCESS_TOKEN=<your_token>
BNET_CLIENT_ID=<your_client_id>       # only needed for OAuth refresh
BNET_CLIENT_SECRET=<your_client_secret> # only needed for OAuth refresh
```

### 3. macOS Keychain (token only)

```bash
security add-generic-password -s wow-api-bnet -a bnet -w <your_access_token>
```

## Token Refresh

Access tokens expire. To get a new one:

```bash
./run src/oauth.ts
# Visit http://localhost:8000/auth in your browser
# The new token will be printed to the terminal
```

Then store the new token in Vault, env var, or Keychain.

## Running Tools

```bash
./run src/<tool>.ts [flags]
```

See `CLAUDE.md` or `CLI_REFERENCE.md` for the full tool list.
