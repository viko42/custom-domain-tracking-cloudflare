/**
 * Reads secrets from .dev.vars (or .env) and sets them via `wrangler secret put`.
 * Skips [vars] entries from wrangler.toml (non-secret config like FALLBACK_ORIGIN).
 *
 * Usage: npx tsx scripts/setup-secrets.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const SECRET_KEYS = ["CF_API_TOKEN", "CF_ZONE_ID", "WEBHOOK_URL", "WEBHOOK_SECRET", "TRACKING_SIGN_KEY"];

function loadEnvFile(filename: string): Record<string, string> {
  const filepath = resolve(process.cwd(), filename);
  if (!existsSync(filepath)) return {};

  const vars: Record<string, string> = {};
  const content = readFileSync(filepath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    vars[key] = value;
  }
  return vars;
}

async function main() {
  // Load from .dev.vars first, then .env as fallback
  const devVars = loadEnvFile(".dev.vars");
  const envVars = loadEnvFile(".env");
  const merged = { ...envVars, ...devVars };

  const secrets = SECRET_KEYS.filter((key) => merged[key]);
  const missing = SECRET_KEYS.filter((key) => !merged[key]);

  if (missing.length > 0) {
    console.warn(`Warning: missing keys (will be skipped): ${missing.join(", ")}`);
  }

  if (secrets.length === 0) {
    console.error("No secrets found in .dev.vars or .env. Nothing to do.");
    process.exit(1);
  }

  console.log(`Setting ${secrets.length} secret(s) via wrangler...\n`);

  let failed = 0;
  for (const key of secrets) {
    const value = merged[key];
    try {
      execSync(`echo "${value}" | npx wrangler secret put ${key}`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      console.log(`  ${key} — set`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ${key} — FAILED: ${msg}`);
      failed++;
    }
  }

  console.log(
    failed > 0
      ? `\nDone with ${failed} error(s).`
      : "\nAll secrets set successfully.",
  );
  if (failed > 0) process.exit(1);
}

main();
