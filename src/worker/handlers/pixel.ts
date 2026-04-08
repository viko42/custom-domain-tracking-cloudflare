import type { TrackingOpenEvent } from "../../types/index.js";
import type { Env } from "../index.js";
import { TRANSPARENT_GIF } from "../pixel.js";
import { fireWebhookAsync } from "../webhook.js";
import { isRateLimited, type RateLimitConfig } from "../ratelimit.js";
import { verifyToken } from "../../sdk/signing.js";

export async function handlePixel(
  trackingId: string,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const hostname = new URL(request.url).hostname;
  console.log(`[pixel] hostname=${hostname} trackingId=${trackingId}`);
  console.log(`[pixel] TRACKING_SIGN_KEY set=${!!env.TRACKING_SIGN_KEY} length=${env.TRACKING_SIGN_KEY?.length ?? 0}`);
  const payload = await verifyToken(env.TRACKING_SIGN_KEY, hostname, trackingId);
  console.log(`[pixel] verify result=${payload ? 'VALID' : 'INVALID'}`, payload);

  if (payload) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

    const rlConfig: RateLimitConfig = {
      enabled: env.RATE_LIMIT_ENABLED === "true",
      kv: env.SUBDOMAINS,
      redisUrl: env.RATE_LIMIT_REDIS_URL,
      redisToken: env.RATE_LIMIT_REDIS_TOKEN,
    };

    if (!(await isRateLimited(rlConfig, ip, trackingId))) {
      const event: TrackingOpenEvent = {
        type: "tracking.open",
        trackingId,
        hostname,
        timestamp: new Date().toISOString(),
        ip,
        userAgent: request.headers.get("user-agent"),
        referer: request.headers.get("referer"),
        payload,
      };

      fireWebhookAsync(env, ctx, event);
    }
  }

  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
