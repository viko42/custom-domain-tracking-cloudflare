import type { WebhookEvent, WebhookPayload } from "../types/index.js";

const RETRY_DELAYS_MS = [500, 1000, 2000];

async function computeHmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWebhook(
  url: string,
  secret: string,
  body: string,
  webhookId: string,
): Promise<boolean> {
  const signature = await computeHmac(secret, body);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Id": webhookId,
      "X-Webhook-Signature": signature,
    },
    body,
  });
  return response.ok;
}

export async function fireWebhook(
  webhookUrl: string,
  webhookSecret: string,
  event: WebhookEvent,
  deadLetterUrl?: string,
): Promise<void> {
  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    event,
    sentAt: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);

  // Attempt initial delivery + retries
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const ok = await sendWebhook(webhookUrl, webhookSecret, body, payload.id);
      if (ok) return;
      console.error(`Webhook delivery failed (attempt ${attempt + 1})`);
    } catch (err) {
      console.error(`Webhook delivery error (attempt ${attempt + 1}):`, err);
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  // All retries exhausted — send to dead letter URL if configured
  if (deadLetterUrl) {
    try {
      const ok = await sendWebhook(deadLetterUrl, webhookSecret, body, payload.id);
      if (!ok) {
        console.error("Dead letter webhook delivery failed");
      }
    } catch (err) {
      console.error("Dead letter webhook delivery error:", err);
    }
  }
}
