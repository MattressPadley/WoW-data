import { execSync } from "child_process";

const DEFAULTS = {
  vaultAddr: "https://vault.padley.dev",
  vaultSecretPath: "kv/data/wow/api",
  keychainService: "wow-api-bnet",
  keychainAccount: "bnet",
};

// Blizzard's OAuth host is region-neutral except for China.
// See src/oauth.ts, which mints against the same endpoint.
const OAUTH_TOKEN_URL = "https://oauth.battle.net/token";
const OAUTH_TOKEN_URL_CN = "https://www.battlenet.com.cn/oauth/token";

// Renew a little before the real expiry so a long-running process never races it.
const EXPIRY_MARGIN_MS = 60_000;
// Stored tokens carry no expiry, so trust them only briefly; a 401 re-mints anyway.
const STORED_TOKEN_TTL_MS = 5 * 60_000;

export interface ApiCredentials {
  /** Optional pre-stored token. A fast-path/fallback only — never the source of truth. */
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

function oauthTokenUrl(region: string): string {
  return region === "cn" ? OAUTH_TOKEN_URL_CN : OAUTH_TOKEN_URL;
}

function vaultCurl(url: string, opts?: { method?: string; body?: string; token?: string }): any {
  const args = ["-sk"];
  if (opts?.method) args.push("-X", opts.method);
  if (opts?.token) args.push("-H", `X-Vault-Token: ${opts.token}`);
  if (opts?.body) args.push("-d", opts.body);
  args.push(url);
  const result = execSync(`curl ${args.map(a => `'${a}'`).join(" ")}`, { encoding: "utf8" });
  return JSON.parse(result);
}

function getCredentialsFromVault(): ApiCredentials | null {
  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;
  if (!roleId || !secretId) return null;

  const vaultAddr = process.env.VAULT_ADDR ?? DEFAULTS.vaultAddr;

  try {
    const loginData = vaultCurl(`${vaultAddr}/v1/auth/approle/login`, {
      method: "POST",
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    });
    const token = loginData?.auth?.client_token;
    if (!token) return null;

    const secretData = vaultCurl(`${vaultAddr}/v1/${DEFAULTS.vaultSecretPath}`, { token });
    const s = secretData?.data?.data;
    if (!s) return null;

    return {
      accessToken: s.access_token,
      clientId: s.client_id,
      clientSecret: s.client_secret,
    };
  } catch {
    return null;
  }
}

function getTokenFromKeychain(): string | null {
  try {
    return execSync(
      `security find-generic-password -s ${DEFAULTS.keychainService} -a ${DEFAULTS.keychainAccount} -w`,
      { encoding: "utf8" }
    ).trim();
  } catch {
    return null;
  }
}

function getCredentialsFromEnv(): ApiCredentials | null {
  const accessToken = process.env.BNET_ACCESS_TOKEN ?? getTokenFromKeychain() ?? undefined;
  const clientId = process.env.BNET_CLIENT_ID;
  const clientSecret = process.env.BNET_CLIENT_SECRET;

  // Client credentials alone are enough — a token is mintable from them.
  if (!accessToken && !(clientId && clientSecret)) return null;

  return { accessToken, clientId, clientSecret };
}

let credentialsCache: ApiCredentials | undefined;

export function getCredentials(): ApiCredentials {
  if (credentialsCache) return credentialsCache;

  const creds = getCredentialsFromVault() ?? getCredentialsFromEnv();
  if (!creds) {
    console.error(JSON.stringify({
      error: "No Blizzard API credentials found. Configure Vault, set BNET_CLIENT_ID/BNET_CLIENT_SECRET (or BNET_ACCESS_TOKEN), or add a token to macOS Keychain.",
      keychain_hint: `security add-generic-password -s ${DEFAULTS.keychainService} -a ${DEFAULTS.keychainAccount} -w <token>`,
    }));
    process.exit(1);
  }

  credentialsCache = creds;
  return creds;
}

/**
 * Mint a fresh token via the OAuth client-credentials grant.
 * Throws on failure. Never includes the secret or the token in the error.
 */
async function mintAccessToken(
  creds: ApiCredentials,
  region: string
): Promise<{ token: string; expiresInMs: number }> {
  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);

  const response = await fetch(oauthTokenUrl(region), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    // data.error is an OAuth error code (e.g. "invalid_client") — safe to surface.
    throw new Error(
      `Failed to mint Blizzard access token: ${response.status}${data.error ? ` ${data.error}` : ""}`
    );
  }

  return { token: data.access_token, expiresInMs: (data.expires_in ?? 86400) * 1000 };
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// In-memory only, per process, keyed by region. Tokens are never written back to disk.
const tokenCache = new Map<string, CachedToken>();
const mintsInFlight = new Map<string, Promise<string>>();

/**
 * Resolve a usable access token.
 *
 * The token is derived, not stored: it is minted on demand from client_id/client_secret
 * and cached in memory for the process lifetime. A pre-stored `access_token` (Vault, env,
 * Keychain) is only a fallback for when minting is impossible.
 *
 * Pass `forceRefresh` after a 401 to discard the cached token and mint a new one.
 *
 * Pass `preferStored` for user-scoped endpoints (`/profile/user/...`). Those need a token
 * from the authorization-code flow with the `wow.profile` scope, which client credentials
 * cannot mint — only the stored token will do.
 */
export async function getAccessToken(
  opts: { region?: string; forceRefresh?: boolean; preferStored?: boolean } = {}
): Promise<string> {
  const region = opts.region ?? "us";

  if (opts.preferStored) {
    const stored = getCredentials().accessToken;
    if (stored) return stored;
    console.error(JSON.stringify({
      error: "This endpoint needs a user-scoped token (wow.profile). Run: ./run src/oauth.ts --profile",
    }));
    process.exit(1);
  }

  if (!opts.forceRefresh) {
    const cached = tokenCache.get(region);
    if (cached && Date.now() < cached.expiresAt) return cached.token;
  }

  const creds = getCredentials();
  const canMint = Boolean(creds.clientId && creds.clientSecret);

  if (!canMint) {
    // No way to mint — fall back to whatever was stored, stale or not.
    if (creds.accessToken) {
      tokenCache.set(region, {
        token: creds.accessToken,
        expiresAt: Date.now() + STORED_TOKEN_TTL_MS,
      });
      return creds.accessToken;
    }
    console.error(JSON.stringify({
      error: "Cannot obtain a Blizzard access token: no client_id/client_secret to mint from and no stored token.",
    }));
    process.exit(1);
  }

  // Collapse concurrent mints for the same region into one request.
  const existing = mintsInFlight.get(region);
  if (existing) return existing;

  const mint = (async () => {
    try {
      const { token, expiresInMs } = await mintAccessToken(creds, region);
      tokenCache.set(region, {
        token,
        expiresAt: Date.now() + Math.max(expiresInMs - EXPIRY_MARGIN_MS, EXPIRY_MARGIN_MS),
      });
      return token;
    } catch (err) {
      // Minting failed (network, revoked client). A stored token may still work.
      if (!opts.forceRefresh && creds.accessToken) {
        tokenCache.set(region, {
          token: creds.accessToken,
          expiresAt: Date.now() + STORED_TOKEN_TTL_MS,
        });
        return creds.accessToken;
      }
      throw err;
    } finally {
      mintsInFlight.delete(region);
    }
  })();

  mintsInFlight.set(region, mint);
  return mint;
}
