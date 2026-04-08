/**
 * Predeploy script — validates CF_API_TOKEN and CF_ZONE_ID before deploying.
 *
 * Loads vars from .dev.vars, then .env (first found wins per key).
 * Explicit env vars override file values.
 *
 * Checks:
 * 1. Both vars are set
 * 2. Token is valid and has Custom Hostnames permission on the zone
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

function loadEnvFile(filename: string): void {
  const filepath = resolve(process.cwd(), filename);
  if (!existsSync(filepath)) return;

  console.log(`Loading vars from ${filename}...`);
  const content = readFileSync(filepath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    // Strip surrounding quotes and whitespace
    const raw = trimmed.slice(eqIndex + 1).trim();
    const value = raw.replace(/^["']|["']$/g, "");
    // Don't override existing env vars
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  // Load .dev.vars first (Wrangler convention), then .env as fallback
  loadEnvFile(".dev.vars");
  loadEnvFile(".env");

  const apiToken = process.env.CF_API_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;

  if (!apiToken) {
    console.error("ERROR: CF_API_TOKEN environment variable is not set.");
    console.error("Set it via: export CF_API_TOKEN=your-token");
    process.exit(1);
  }

  if (!zoneId) {
    console.error("ERROR: CF_ZONE_ID environment variable is not set.");
    console.error("Set it via: export CF_ZONE_ID=your-zone-id");
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  // Verify token + permissions by directly testing Custom Hostnames access on the zone.
  // This is more reliable than /user/tokens/verify which doesn't work for account-scoped tokens.
  console.log(`Verifying API token and Custom Hostnames permission on zone ${zoneId}...`);
  const chRes = await fetch(
    `${CF_API_BASE}/zones/${zoneId}/custom_hostnames?per_page=1`,
    { headers },
  );
  const chData = (await chRes.json()) as {
    success: boolean;
    errors: { code: number; message: string }[];
  };

  if (!chData.success) {
    const errors = chData.errors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");

    if (chRes.status === 401) {
      console.error("ERROR: API token is invalid or expired.");
      console.error(errors);
      console.error("");
      console.error("Common causes:");
      console.error("  1. Token was revoked or regenerated — copy the latest from the dashboard");
      console.error("  2. Extra whitespace in .dev.vars — ensure no spaces around the '='");
      console.error("  3. Using a Global API Key instead of an API Token");
      console.error("");
      console.error(`  Token loaded (first 10 chars): ${apiToken.slice(0, 10)}...`);
      console.error(`  Token length: ${apiToken.length}`);
    } else if (chRes.status === 403) {
      console.error("ERROR: Token lacks Custom Hostnames permission on this zone.");
      console.error("Required permission: Zone > SSL and Certificates > Edit");
      console.error(errors);
    } else if (chRes.status === 404) {
      console.error("ERROR: Zone not found. Check your CF_ZONE_ID.");
      console.error(errors);
    } else {
      console.error(`ERROR: Custom Hostnames check failed (HTTP ${chRes.status}).`);
      console.error(errors);
    }
    process.exit(1);
  }

  console.log("  Token is valid.");
  console.log("  Custom Hostnames permission confirmed.");
  console.log("\nAll checks passed. Proceeding with deploy.");
}

main();
