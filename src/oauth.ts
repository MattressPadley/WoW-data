#!/usr/bin/env bun
/**
 * oauth.ts — Get/refresh Blizzard API tokens
 *
 * Usage:
 *   ./run src/oauth.ts                     # Client credentials (game data, no browser)
 *   ./run src/oauth.ts --profile           # Authorization code (profile data, browser required)
 *
 * Tokens are automatically stored in Vault.
 */

import { getCredentials } from "./connection.ts";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { hasFlag } from "./utils.ts";

const PORT = 8000;
const HOST = "sophie.home";
const VAULT_ADDR = process.env.VAULT_ADDR ?? "https://vault.padley.dev";

const creds = getCredentials();
const clientId = creds.clientId;
const clientSecret = creds.clientSecret;

if (!clientId || !clientSecret) {
  console.error(JSON.stringify({
    error: "OAuth requires client_id and client_secret. Set BNET_CLIENT_ID/BNET_CLIENT_SECRET or store in Vault.",
  }));
  process.exit(1);
}

function storeTokenInVault(accessToken: string): boolean {
  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;
  if (!roleId || !secretId) return false;

  try {
    const loginBody = JSON.stringify({ role_id: roleId, secret_id: secretId });
    const loginResult = execSync(
      `curl '-sk' '-X' 'POST' '-d' '${loginBody}' '${VAULT_ADDR}/v1/auth/approle/login'`,
      { encoding: "utf8" }
    );
    const vaultToken = JSON.parse(loginResult)?.auth?.client_token;
    if (!vaultToken) return false;

    const readResult = execSync(
      `curl '-sk' '-H' 'X-Vault-Token: ${vaultToken}' '${VAULT_ADDR}/v1/kv/data/wow/api'`,
      { encoding: "utf8" }
    );
    const existing = JSON.parse(readResult)?.data?.data ?? {};

    const updated = { ...existing, access_token: accessToken };
    const writeBody = JSON.stringify({ data: updated });
    execSync(
      `curl '-sk' '-X' 'POST' '-H' 'X-Vault-Token: ${vaultToken}' '-H' 'Content-Type: application/json' '-d' '${writeBody}' '${VAULT_ADDR}/v1/kv/data/wow/api'`,
      { encoding: "utf8" }
    );

    return true;
  } catch {
    return false;
  }
}

// --- Client Credentials flow (default, no browser) ---
if (!hasFlag("--profile")) {
  try {
    const tokenResponse = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });

    const tokenData = await tokenResponse.json() as { access_token?: string; expires_in?: number };
    if (!tokenData.access_token) {
      console.error(JSON.stringify({ error: "Failed to get access token" }));
      process.exit(1);
    }

    const stored = storeTokenInVault(tokenData.access_token);
    if (stored) {
      console.error("Access token stored in Vault at kv/data/wow/api");
      console.log(JSON.stringify({ success: true, expires_in: tokenData.expires_in }));
    } else {
      console.log(JSON.stringify({ access_token: tokenData.access_token, expires_in: tokenData.expires_in }));
    }
  } catch (err: any) {
    console.error(JSON.stringify({ error: err.message ?? String(err) }));
    process.exit(1);
  }
  process.exit(0);
}

// --- Authorization Code flow (--profile, requires browser) ---
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/auth") {
      const redirectUri = `http://${HOST}:${PORT}/callback`;
      const state = randomUUID();
      const scope = "wow.profile";
      const authUrl = `https://oauth.battle.net/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing authorization code", { status: 400 });
      }

      const tokenResponse = await fetch("https://oauth.battle.net/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          grant_type: "authorization_code",
          code,
          redirect_uri: `http://${HOST}:${PORT}/callback`,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        return new Response("Failed to get access token", { status: 500 });
      }

      const stored = storeTokenInVault(tokenData.access_token);
      if (stored) {
        console.error("Profile access token stored in Vault at kv/data/wow/api");
        return new Response("Authentication successful! Token stored in Vault. You can close this tab.");
      } else {
        console.log(JSON.stringify({ access_token: tokenData.access_token }, null, 2));
        return new Response("Authentication successful! Token printed to terminal (Vault storage failed). You can close this tab.");
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.error(`OAuth server running on http://${HOST}:${PORT}`);
console.error(`Visit http://${HOST}:${PORT}/auth to start the flow`);
