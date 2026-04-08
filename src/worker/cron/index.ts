import type { Env } from "../index.js";
import { CloudflareClient } from "../../sdk/client.js";
import { getAllHostnames } from "../../sdk/kv.js";
import { fireWebhook } from "../../sdk/webhook.js";
import { verifyHostname } from "./verify.js";
import { buildStatusChangeEvent, buildHeartbeatEvent } from "./notify.js";

const BATCH_SIZE = 10;

function isHeartbeatWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === 0 && now.getUTCMinutes() < 5;
}

export async function runCronVerification(env: Env, ctx: ExecutionContext): Promise<void> {
  const client = new CloudflareClient(env.CF_API_TOKEN, env.CF_ZONE_ID);
  const hostnames = await getAllHostnames(env.SUBDOMAINS);

  if (hostnames.length === 0) {
    return;
  }

  const sendHeartbeats = isHeartbeatWindow();

  // Process in batches to avoid hitting rate limits
  for (let i = 0; i < hostnames.length; i += BATCH_SIZE) {
    const batch = hostnames.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((hostname) => verifyHostname(client, env.SUBDOMAINS, hostname)),
    );

    for (const result of results) {
      if (!result) {
        continue;
      }

      if (result.changed) {
        const event = buildStatusChangeEvent(
          result.record,
          result.previousStatus,
          result.newStatus,
        );

        if (event) {
          ctx.waitUntil(fireWebhook(env.WEBHOOK_URL, env.WEBHOOK_SECRET, event, env.WEBHOOK_DEAD_LETTER_URL));
        }
      } else if (sendHeartbeats && result.newStatus === "active") {
        const event = buildHeartbeatEvent(result.record);
        ctx.waitUntil(fireWebhook(env.WEBHOOK_URL, env.WEBHOOK_SECRET, event, env.WEBHOOK_DEAD_LETTER_URL));
      }
    }
  }
}
