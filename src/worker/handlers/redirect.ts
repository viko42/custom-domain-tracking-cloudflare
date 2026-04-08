import type { TrackingClickEvent } from "../../types/index.js";
import type { Env } from "../index.js";
import { fireWebhookAsync } from "../webhook.js";
import { isRateLimited, type RateLimitConfig } from "../ratelimit.js";
import { verifyToken } from "../../sdk/signing.js";

export async function handleRedirect(
  linkId: string,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  console.log(`[redirect] hostname=${url.hostname} linkId=${linkId}`);
  console.log(`[redirect] TRACKING_SIGN_KEY set=${!!env.TRACKING_SIGN_KEY} length=${env.TRACKING_SIGN_KEY?.length ?? 0}`);
  const payload = await verifyToken(env.TRACKING_SIGN_KEY, url.hostname, linkId);
  console.log(`[redirect] verify result=${payload ? 'VALID' : 'INVALID'}`, payload);

  // Resolve destination URL: signed payload.url takes priority (tamper-proof),
  // then ?url= query param as fallback for unsigned/legacy links.
  const destinationUrl = (payload?.url as string | undefined)
    ?? url.searchParams.get("url")
    ?? null;

  if (!destinationUrl) {
    return new Response("Missing destination url", { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(destinationUrl);
  } catch {
    return new Response("Invalid destination url", { status: 400 });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return new Response("Invalid url scheme", { status: 400 });
  }

  if (payload) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

    const rlConfig: RateLimitConfig = {
      enabled: env.RATE_LIMIT_ENABLED === "true",
      kv: env.SUBDOMAINS,
      redisUrl: env.RATE_LIMIT_REDIS_URL,
      redisToken: env.RATE_LIMIT_REDIS_TOKEN,
    };

    if (!(await isRateLimited(rlConfig, ip, linkId))) {
      const event: TrackingClickEvent = {
        type: "tracking.click",
        linkId,
        destinationUrl,
        hostname: url.hostname,
        timestamp: new Date().toISOString(),
        ip,
        userAgent: request.headers.get("user-agent"),
        referer: request.headers.get("referer"),
        payload,
      };

      fireWebhookAsync(env, ctx, event);
    }
  }

  return Response.redirect(destinationUrl, 302);
}
