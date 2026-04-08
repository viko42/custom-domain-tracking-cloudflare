import { route } from "./router.js";
import { runCronVerification } from "./cron/index.js";

function validateWebhookSecret(secret: string): void {
  const issues: string[] = [];
  if (secret.length < 20) issues.push("at least 20 characters");
  if (!/[a-z]/.test(secret)) issues.push("lowercase letters");
  if (!/[A-Z]/.test(secret)) issues.push("uppercase letters");
  if (!/[0-9]/.test(secret)) issues.push("numbers");
  if (!/[^a-zA-Z0-9]/.test(secret)) issues.push("symbols");
  if (issues.length > 0) {
    console.warn(`⚠ WEBHOOK_SECRET is weak — missing: ${issues.join(", ")}. Use a strong secret with 20+ chars, mixed case, numbers, and symbols.`);
  }
}

export interface Env {
  SUBDOMAINS: KVNamespace;
  CF_API_TOKEN: string;
  CF_ZONE_ID: string;
  FALLBACK_ORIGIN: string;
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
  TRACKING_SIGN_KEY: string;
  WEBHOOK_DEAD_LETTER_URL?: string;
  RATE_LIMIT_ENABLED?: string;
  RATE_LIMIT_REDIS_URL?: string;
  RATE_LIMIT_REDIS_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    validateWebhookSecret(env.WEBHOOK_SECRET);
    return route(request, env, ctx);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await runCronVerification(env, ctx);
  },
};
