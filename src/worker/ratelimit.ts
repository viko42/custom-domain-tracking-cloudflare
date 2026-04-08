/**
 * Rate limiter for webhook deduplication.
 *
 * Three modes controlled by environment variables:
 *
 * 1. **Disabled** (`RATE_LIMIT_ENABLED` unset or `"false"`)
 *    No rate limiting — every valid tracking hit fires a webhook.
 *    Suitable when deduplication is handled downstream.
 *
 * 2. **KV-based** (`RATE_LIMIT_ENABLED = "true"`, no `RATE_LIMIT_REDIS_URL`)
 *    Uses Cloudflare KV to count requests per IP + route key.
 *    ⚠ Cloudflare Workers free plan allows only 1,000 KV writes/day,
 *    so this effectively caps you at ~1,000 unique tracking events/day.
 *    Upgrade to the Workers Paid plan ($5/month) for 1M writes/day.
 *
 * 3. **Redis-based** (`RATE_LIMIT_ENABLED = "true"` + `RATE_LIMIT_REDIS_URL`)
 *    Uses an external Redis instance (e.g. Upstash) via REST-compatible HTTP API.
 *    Bypasses KV write limits entirely.
 *    Auth can be provided two ways:
 *      - Token in the URL itself (e.g. `https://user:password@xxx.upstash.io`)
 *      - Separate `RATE_LIMIT_REDIS_TOKEN` secret (sent as Bearer token)
 */

const MAX_REQUESTS = 50;
const WINDOW_SECONDS = 60;

export interface RateLimitConfig {
  enabled: boolean;
  kv: KVNamespace;
  redisUrl?: string;
  redisToken?: string;
}

/**
 * Returns true if the webhook should be suppressed.
 * Allows up to MAX_REQUESTS per IP + route key per WINDOW_SECONDS.
 */
export async function isRateLimited(config: RateLimitConfig, ip: string, routeKey: string): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  if (config.redisUrl) {
    return isRateLimitedRedis(config.redisUrl, config.redisToken, ip, routeKey);
  }

  return isRateLimitedKV(config.kv, ip, routeKey);
}

async function isRateLimitedKV(kv: KVNamespace, ip: string, routeKey: string): Promise<boolean> {
  const key = `ratelimit:${ip}:${routeKey}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= MAX_REQUESTS) {
    return true;
  }

  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return false;
}

async function isRateLimitedRedis(
  redisUrl: string,
  redisToken: string | undefined,
  ip: string,
  routeKey: string,
): Promise<boolean> {
  const key = `ratelimit:${ip}:${routeKey}`;
  const headers: Record<string, string> = {};
  if (redisToken) {
    headers["Authorization"] = `Bearer ${redisToken}`;
  }

  // Upstash REST API: INCR then EXPIRE
  const incrResp = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, { headers });

  if (!incrResp.ok) {
    console.error(`[ratelimit] Redis INCR failed: ${incrResp.status}`);
    return false; // fail open
  }

  const { result: count } = (await incrResp.json()) as { result: number };

  // Set expiry only on first increment
  if (count === 1) {
    await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${WINDOW_SECONDS}`, { headers });
  }

  return count > MAX_REQUESTS;
}
