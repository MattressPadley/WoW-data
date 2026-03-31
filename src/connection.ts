import { execSync } from "child_process";

const DEFAULTS = {
  vaultAddr: "https://vault.padley.dev",
  vaultSecretPath: "kv/data/wow/api",
  keychainService: "wow-api-bnet",
  keychainAccount: "bnet",
};

export interface ApiCredentials {
  accessToken: string;
  clientId?: string;
  clientSecret?: string;
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
  const accessToken =
    process.env.BNET_ACCESS_TOKEN ??
    getTokenFromKeychain();

  if (!accessToken) return null;

  return {
    accessToken,
    clientId: process.env.BNET_CLIENT_ID,
    clientSecret: process.env.BNET_CLIENT_SECRET,
  };
}

export function getCredentials(): ApiCredentials {
  const creds = getCredentialsFromVault() ?? getCredentialsFromEnv();
  if (!creds) {
    console.error(JSON.stringify({
      error: "No Blizzard API credentials found. Configure Vault, set BNET_ACCESS_TOKEN env var, or add to macOS Keychain.",
      keychain_hint: `security add-generic-password -s ${DEFAULTS.keychainService} -a ${DEFAULTS.keychainAccount} -w <token>`,
    }));
    process.exit(1);
  }
  return creds;
}
