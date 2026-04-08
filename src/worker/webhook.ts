import type { WebhookEvent } from "../types/index.js";
import { fireWebhook } from "../sdk/webhook.js";
import type { Env } from "./index.js";

export function fireWebhookAsync(env: Env, ctx: ExecutionContext, event: WebhookEvent): void {
  ctx.waitUntil(fireWebhook(env.WEBHOOK_URL, env.WEBHOOK_SECRET, event, env.WEBHOOK_DEAD_LETTER_URL));
}
