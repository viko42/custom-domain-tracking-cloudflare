# Integrator Guide — Custom Domain Tracking

This guide is intended for the technical team integrating the custom domain tracking system into their platform.

> **Convention**: throughout this guide, `integrator.com` represents **your own domain** (the one on which you deploy the Cloudflare Worker). Replace it with your actual domain.

---

## 1. Cloudflare Prerequisites

### a) Create an API Token

1. Log in to your Cloudflare dashboard
2. Go to **My Profile → API Tokens → Create Token**
3. Required permissions:
   - **Zone → SSL and Certificates → Edit**
   - **Account → Workers KV Storage → Edit**
4. Scope: the specific zone (e.g., `integrator.com`)
5. Note down the token

### b) Retrieve the Zone ID & Account ID

Visible at the bottom right of the **Overview** page for your zone in the Cloudflare dashboard.

---

## 2. Configure Cloudflare for SaaS (Custom Hostnames)

### a) Create the fallback origin

1. In the Cloudflare dashboard, select your zone (e.g., `integrator.com`)
2. Go to **DNS → Records**
3. Create a record:
   - **Type**: `AAAA`
   - **Name**: `fallback` (which gives `fallback.integrator.com`)
   - **IPv6 Address**: `100::`
   - **Proxy status**: **Proxied** (orange cloud)

### b) Enable Custom Hostnames and configure the fallback

1. Go to **SSL/TLS → Custom Hostnames**
2. Enable the feature (Business or Enterprise plan required, or add-on for Pro [If more than 100 hostnames])
3. Configure the **Fallback Origin**: `fallback.integrator.com`

> **How does it work?** When a user creates a CNAME `track.theirdomain.com → fallback.integrator.com`, Cloudflare for SaaS intercepts the traffic and routes it to the fallback origin. Since the Worker listens on this zone, requests arrive at the right place regardless of the original hostname.

---

## 3. Worker Deployment

### a) Create the KV namespace

```bash
npx wrangler kv namespace create SUBDOMAINS
# Output: { binding = "SUBDOMAINS", id = "xxxx" }
```

### b) Configure `wrangler.toml`

```toml
name = "custom-domain-tracking"
main = "src/worker/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "SUBDOMAINS"
id = "xxxx"  # ID of the KV namespace created above

[vars]
FALLBACK_ORIGIN = "fallback.integrator.com"

[triggers]
crons = ["*/5 * * * *"]
```

### c) Configure secrets

Enter your secrets in `.dev.vars` at the project root:

```
CF_API_TOKEN=your-api-token
CF_ZONE_ID=your-zone-id
WEBHOOK_URL=https://api.mysite.com/webhooks/tracking
WEBHOOK_SECRET=your-hmac-secret
WEBHOOK_DEAD_LETTER_URL=https://api.mysite-backup.com/webhooks/tracking
TRACKING_SIGN_KEY=<secure-random-key>
```

Then push them to Cloudflare with a single command:

```bash
npm run setup-secrets
```

> **Manual alternative**: you can also configure them one by one with `npx wrangler secret put CF_API_TOKEN`, etc.

### d) Verify the token and deploy

The `deploy` command automatically verifies that the token is valid and has the correct permissions before deploying:

```bash
npm run deploy
```

You can also verify the token without deploying:

```bash
npm run predeploy
```

### e) Configure Worker routes

The Worker must receive traffic from all subdomains (fallback + user custom hostnames). To do this, use a **wildcard route** combined with **exclusion routes** to protect your website and other subdomains.

> **Prerequisite**: the Worker must already be deployed (step 3d) before creating routes.

In the Cloudflare dashboard:

1. Go to **Workers & Pages → custom-domain-tracking → Settings → Triggers**
2. Under **Routes**, add the wildcard route:

   | Route | Worker |
   |---|---|
   | `*.integrator.com/*` | `custom-domain-tracking` |

   This route captures **all traffic** on all subdomains of your zone.

3. Add an exclusion route for your **main domain** (your website):

   | Route | Worker |
   |---|---|
   | `integrator.com/*` | **None** |

   This allows your website (`integrator.com`) to continue working normally without going through the Worker.

4. If you have other subdomains you want to exclude (e.g., `app.integrator.com`, `api.integrator.com`), add an exclusion route for each:

   | Route | Worker |
   |---|---|
   | `app.integrator.com/*` | **None** |
   | `api.integrator.com/*` | **None** |

> **How does it work?** Cloudflare evaluates routes by **specificity**: an explicit route (`app.integrator.com/*`) always takes priority over a wildcard route (`*.integrator.com/*`). This way the Worker only receives traffic from tracking subdomains (fallback + user custom hostnames), and your other services remain intact.

### f) Verify that the Worker is running

```bash
curl https://fallback.integrator.com/health
# → OK
```

---

## 4. SDK Integration in Your Backend

### a) Initialization

```typescript
import { createSDK } from "./src/sdk/index.js";

// In a Cloudflare Workers context (e.g., another Worker or Pages Function)
const sdk = createSDK({
  cfApiToken: env.CF_API_TOKEN,
  cfZoneId: env.CF_ZONE_ID,
  webhookUrl: env.WEBHOOK_URL,
  kvNamespace: env.SUBDOMAINS,
  signingSecret: env.TRACKING_SIGN_KEY,
});
```

### b) When a user requests a custom domain

The user wants to use their own tracking domain. The SDK creates the custom hostname on the Cloudflare side:

```typescript
// The user wants to use "track.theirdomain.com" as their tracking domain
const subdomain = await sdk.createSubdomain({
  hostname: "track.theirdomain.com",
  metadata: {
    userId: "user-123",
    plan: "premium",
  },
});
// Metadata is optional

console.log(subdomain.status); // "pending"
// → Tell the user to add a CNAME:
//   track.theirdomain.com → fallback.integrator.com
// → The cron job will automatically verify every 5 minutes
```

### c) What the user needs to do on their end

The user must add a DNS record with their registrar:

| Type  | Name    | Value                     |
|-------|---------|---------------------------|
| CNAME | `track` | `fallback.integrator.com`  |

That's it. Once the CNAME has propagated, Cloudflare automatically provisions SSL and activates the custom hostname.

### d) Check a domain's status

```typescript
const status = await sdk.getSubdomain({ hostname: "track.theirdomain.com" });

if (status?.status === "active") {
  // The domain is verified, we can use it in emails
}
```

### e) List all domains

```typescript
const all = await sdk.listSubdomains();
const active = all.filter((s) => s.status === "active");
const pending = all.filter((s) => s.status === "pending" || s.status === "ssl_pending");
```

### f) Delete a domain

```typescript
await sdk.deleteSubdomain({ hostname: "track.theirdomain.com" });
```

---

## 5. Generating Tracking Links in Emails

### Domain selection logic

```typescript
function getTrackingDomain(user: { customDomain?: string }): string {
  // If the user has an active custom domain, use it
  if (user.customDomain) {
    return user.customDomain; // e.g., "track.theirdomain.com"
  }
  // Otherwise, use the default domain
  return "fallback.integrator.com";
}
```

### Generating signed tracking tokens

All tracking IDs (for both pixels and links) are **signed tokens** scoped to a specific hostname. This ensures tokens can't be forged or reused across domains.

The SDK provides two encoding formats:

| Format | Structure | URL example | Best for |
|--------|-----------|-------------|----------|
| **dotted** | `{base64Payload}.{base64Signature}` | `/t/eyJlIjoiMTIz.abc123` | Debugging, readable URLs |
| **packed** (default) | `base64({payload}.{signature})` | `/t/ZXlKbFh5STZJakV5` | Production — single opaque token, no dots in the path, less likely to be flagged |

```typescript
// Generate a signed tracking token
const trackingId = await sdk.generateTrackingId(
  "track.theirdomain.com",
  { emailId: "email-uuid-123", userId: "user-123" },
  "packed", // or "dotted" — defaults to "packed"
);
```

### Open pixel (email open tracking)

```typescript
async function buildOpenPixel(trackingDomain: string, payload: Record<string, unknown>): Promise<string> {
  const trackingId = await sdk.generateTrackingId(trackingDomain, payload, "packed");
  return `<img src="https://${trackingDomain}/t/${trackingId}" width="1" height="1" alt="" style="display:none" />`;
}
```

### Clickable link (click tracking)

Two approaches are supported. Both work — pick the one that fits your needs:

#### Option A: URL embedded in the token (recommended)

The destination URL is baked into the signed payload. The resulting link is **clean and short** — no query string.

```typescript
async function buildTrackedLink(
  trackingDomain: string,
  payload: Record<string, unknown>,
  destinationUrl: string,
): Promise<string> {
  const linkId = await sdk.generateTrackingId(
    trackingDomain,
    { ...payload, url: destinationUrl },
    "packed",
  );
  return `https://${trackingDomain}/r/${linkId}`;
}

// Example output:
// <a href="https://track.theirdomain.com/r/ZXlKbFh5STZJakV5TXl...">
//   Click here
// </a>
```

#### Option B: URL as query parameter

The destination URL is passed separately in `?url=`. The token is shorter but the full link is longer and the destination is visible.

```typescript
async function buildTrackedLink(
  trackingDomain: string,
  payload: Record<string, unknown>,
  destinationUrl: string,
): Promise<string> {
  const linkId = await sdk.generateTrackingId(trackingDomain, payload, "packed");
  const encoded = encodeURIComponent(destinationUrl);
  return `https://${trackingDomain}/r/${linkId}?url=${encoded}`;
}

// Example output:
// <a href="https://track.theirdomain.com/r/ZXlKbFh5STZJakV5TXl...?url=https%3A%2F%2Fexample.com">
//   Click here
// </a>
```

> **Note**: if both `?url=` and a `url` field in the payload are present, the query parameter takes priority.

### Full example: generating an email

```typescript
async function prepareEmail(user: User, email: Email, links: Link[]): Promise<string> {
  const domain = getTrackingDomain(user);

  // Replace each link with a tracked link
  let html = email.htmlContent;
  for (const link of links) {
    const trackedUrl = await buildTrackedLink(
      domain,
      { linkId: link.id, emailId: email.id, userId: user.id },
      link.url,
    );
    html = html.replace(link.url, trackedUrl);
  }

  // Add the tracking pixel at the end of the body
  const pixel = await buildOpenPixel(domain, { emailId: email.id, userId: user.id });
  html = html.replace("</body>", `${pixel}</body>`);

  return html;
}
```

---

## 6. Receiving Webhooks

### Webhook endpoint

Create an endpoint on your server to receive events:

```typescript
// POST https://api.mysite.com/webhooks/tracking

app.post("/webhooks/tracking", async (req, res) => {
  // 1. Verify the HMAC signature
  const signature = req.headers["x-webhook-signature"];
  const webhookId = req.headers["x-webhook-id"];
  const body = JSON.stringify(req.body);

  const expectedSig = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  if (signature !== expectedSig) {
    return res.status(401).send("Invalid signature");
  }

  // 2. Idempotency — check if we've already processed this webhook
  if (await alreadyProcessed(webhookId)) {
    return res.status(200).send("Already processed");
  }

  // 3. Process the event
  const { event } = req.body;

  switch (event.type) {
    case "tracking.open":
      // An email was opened — event.payload contains your original metadata
      await recordEmailOpen(event.payload.emailId, {
        userId: event.payload.userId,
        ip: event.ip,
        userAgent: event.userAgent,
        timestamp: event.timestamp,
      });
      break;

    case "tracking.click":
      // A link was clicked — event.payload contains your original metadata
      await recordLinkClick(event.payload.linkId, {
        userId: event.payload.userId,
        emailId: event.payload.emailId,
        destinationUrl: event.destinationUrl,
        ip: event.ip,
        userAgent: event.userAgent,
        timestamp: event.timestamp,
      });
      break;

    case "domain.verified":
      // The custom domain is active — update the user's status
      await activateCustomDomain(event.hostname);
      break;

    case "domain.failed":
      // Verification failed — notify the user
      await notifyDomainFailed(event.hostname, event.errors);
      break;

    case "domain.disconnected":
      // The domain was active but no longer is
      // → Switch the user back to fallback.integrator.com
      await deactivateCustomDomain(event.hostname);
      break;
  }

  res.status(200).send("OK");
});
```

### Webhook payloads

**Email opened:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sentAt": "2026-04-04T12:00:00.000Z",
  "event": {
    "type": "tracking.open",
    "trackingId": "ZXlKbFh5STZJakV5...",
    "hostname": "track.theirdomain.com",
    "timestamp": "2026-04-04T12:00:00.000Z",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0 ...",
    "referer": null,
    "payload": {
      "emailId": "email-uuid-123",
      "userId": "user-123"
    }
  }
}
```

The `payload` field contains the metadata you passed to `sdk.generateTrackingId()` when building the tracking pixel. Use it to identify which email was opened and by which user without needing a separate lookup.

**Link clicked:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "sentAt": "2026-04-04T12:01:00.000Z",
  "event": {
    "type": "tracking.click",
    "linkId": "ZXlKbFh5STZJakV5...",
    "destinationUrl": "https://example.com/pricing",
    "hostname": "track.theirdomain.com",
    "timestamp": "2026-04-04T12:01:00.000Z",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0 ...",
    "referer": null,
    "payload": {
      "linkId": "link-456",
      "emailId": "email-uuid-123",
      "userId": "user-123"
    }
  }
}
```

**Domain verified:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "sentAt": "2026-04-04T12:10:00.000Z",
  "event": {
    "type": "domain.verified",
    "hostname": "track.theirdomain.com",
    "cfCustomHostnameId": "cf-id-xxx",
    "timestamp": "2026-04-04T12:10:00.000Z"
  }
}
```

---

## 7. Domain Lifecycle

```
User requests a custom domain
        │
        ▼
sdk.createSubdomain()  ──→  status: "pending"
  (creates the custom hostname on the Cloudflare side)
        │
        │  User adds the CNAME:
        │  track.theirdomain.com → fallback.integrator.com
        │
        ▼
Cron verifies (every 5 min)
        │
        ├─→ CNAME found, SSL in progress   ──→  status: "ssl_pending"
        │
        ├─→ SSL provisioned                ──→  status: "active"
        │                                        webhook: domain.verified ✓
        │
        ├─→ CNAME not found                ──→  status: "failed"
        │                                        webhook: domain.failed ✗
        │
        └─→ Was active, CNAME removed      ──→  status: "disconnected"
                                                 webhook: domain.disconnected ⚠
```

---

## 8. Production Checklist

In this order:

- [ ] Cloudflare API Token created with permissions: Zone > SSL and Certificates > Edit + Account > Workers KV Storage > Edit
- [ ] Zone & Account ID retrieved
- [ ] DNS record `AAAA fallback 100::` created (proxied)
- [ ] Cloudflare for SaaS enabled on the zone
- [ ] Fallback Origin configured to `fallback.integrator.com`
- [ ] KV namespace created and ID entered in `wrangler.toml`
- [ ] Secrets entered in `.dev.vars` and pushed via `npm run setup-secrets`
- [ ] Worker deployed with `npm run deploy` (automatically verifies the token)
- [ ] Route `*.integrator.com/*` → Worker `custom-domain-tracking` created
- [ ] Route `integrator.com/*` → **None** created (protects the website)
- [ ] Exclusion routes added for other existing subdomains (e.g., `app.integrator.com/*` → None)
- [ ] `curl https://fallback.integrator.com/health` returns `OK`
- [ ] Webhook endpoint implemented and publicly accessible
- [ ] HMAC signature verified on the webhook side
- [ ] Fallback logic: if custom domain is not active → use `fallback.integrator.com`
- [ ] End-to-end test: create a subdomain via the SDK, user adds their CNAME, wait for verification
