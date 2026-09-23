# Credentials & Access Tokens

## Credential chain

`src/connection.ts` resolves credentials in order:

1. **Vault AppRole** — the `./run` wrapper injects `VAULT_ROLE_ID` / `VAULT_SECRET_ID`
   and reads `kv/data/wow/api`.
2. **Environment** — `BNET_CLIENT_ID` / `BNET_CLIENT_SECRET` (and optionally `BNET_ACCESS_TOKEN`).
3. **macOS Keychain** — a stored token only (`wow-api-bnet` / `bnet`).

The durable secrets are `client_id` and `client_secret`. Everything else is derived.

> Agents must never read `~/.vault-tokens/` or call Vault directly. The `./run` wrapper is
> the only sanctioned path.

## Tokens are derived, not stored

Blizzard's client-credentials access tokens expire after ~24h. Rather than trusting a
pre-stored token, `getAccessToken()` mints a fresh one on demand:

```
POST https://oauth.battle.net/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

(`https://www.battlenet.com.cn/oauth/token` for the `cn` region.)

Behaviour:

- **Cached in memory** per process, keyed by region, until 60s before expiry.
- **Concurrent mints collapse** into a single in-flight request.
- **`401` self-heals** — `makeRequest` forces one re-mint and retries.
- **A stored `access_token` is a fallback only**, used when no `client_id`/`client_secret`
  is available or when a mint fails. It is never the source of truth.
- **Nothing is written back to disk.** Minted tokens live only in memory. `./run src/oauth.ts`
  still writes a token to Vault, but no longer needs to be run routinely.

## User-scoped endpoints

`/profile/user/wow` and `/profile/user/wow/protected-character/...` (`src/account.ts`) require
an **authorization-code** token with the `wow.profile` scope. Client credentials cannot mint
one. These calls use the stored token explicitly; when it lapses they fail with:

```
401 Unauthorized — the stored user token is expired. Run: ./run src/oauth.ts --profile
```

Refresh it with `./run src/oauth.ts --profile`.

## Secret hygiene

Tokens and secrets are never logged. OAuth failures surface only the HTTP status and the
OAuth error code (e.g. `invalid_client`) — never the request body or the credentials.
