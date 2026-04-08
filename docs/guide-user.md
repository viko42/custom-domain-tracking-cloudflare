# User Guide — Enable Custom Domain Tracking

This guide is for end users of the platform who want to use their own domain for email tracking.

---

## Why use a custom domain?

By default, tracking links in your emails use the platform's domain (e.g., `fallback.integrator.com`). With a custom domain, they'll use **your own domain**:

| Without custom domain | With custom domain |
|---|---|
| `fallback.integrator.com/t/abc123` | `t.user-domain.com/t/abc123` |
| `fallback.integrator.com/r/lnk?url=...` | `t.user-domain.com/r/lnk?url=...` |

**Benefits:**
- **Better deliverability** — links point to your domain, not a shared third-party domain
- **Branding** — your recipients see your domain in the links
- **Domain reputation** — you build your own sending reputation

---

## Step 1: Choose your subdomain

Pick a subdomain of your main domain. Common examples:

| Subdomain | Full domain |
|---|---|
| `t` | `t.user-domain.com` |
| `tracking` | `tracking.user-domain.com` |
| `click` | `click.user-domain.com` |
| `mail` | `mail.user-domain.com` |

> **Recommendation**: use `t` — it's short and will never be visible to your recipients in the email content.

---

## Step 2: Add the CNAME record

Log in to your domain's DNS management panel (Cloudflare, GoDaddy, OVH, Gandi, Namecheap, etc.) and add a **CNAME record**:

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** (Name / Host) | `t` (or your chosen subdomain) |
| **Target** (Target / Value) | `fallback.integrator.com` (provided by the platform) |
| **TTL** | Auto or 3600 |

### Examples by DNS provider

#### Cloudflare
1. Dashboard → your domain → **DNS → Records → Add record**
2. Type: `CNAME`
3. Name: `t`
4. Target: `fallback.integrator.com`
5. Proxy status: **Proxied** (orange cloud)
6. Save

#### OVH
1. Web Cloud → your domain → **DNS Zone → Add an entry**
2. Type: `CNAME`
3. Subdomain: `t`
4. Target: `fallback.integrator.com.` (with the trailing dot)
5. Confirm

#### GoDaddy
1. My Products → your domain → **DNS → Add Record**
2. Type: `CNAME`
3. Name: `t`
4. Value: `fallback.integrator.com`
5. TTL: 1 Hour
6. Save

#### Namecheap
1. Domain List → your domain → **Advanced DNS → Add New Record**
2. Type: `CNAME`
3. Host: `t`
4. Value: `fallback.integrator.com`
5. TTL: Automatic
6. Save

#### Gandi
1. Your domain → **DNS Records → Add Record**
2. Type: `CNAME`
3. Name: `t`
4. Hostname: `fallback.integrator.com.` (with the trailing dot)
5. Save

---

## Step 3: Activate in the platform

1. Go to **Settings → Custom Domain** (or the equivalent in your platform)
2. Enter your full subdomain: `t.user-domain.com`
3. Click **Activate**

The platform will register your domain and start verifying the DNS configuration.

---

## Step 4: Wait for verification

Verification runs automatically every 5 minutes. The process follows these steps:

```
1. DNS verification (CNAME)      ⏳ A few minutes to 48h depending on your DNS
2. SSL provisioning               ⏳ A few minutes
3. Domain active                  ✅ Ready to use
```

### Possible statuses

| Status | Meaning |
|---|---|
| **Pending** | We are verifying your DNS configuration |
| **SSL pending** | The CNAME is valid, the SSL certificate is being created |
| **Active** | All good — your domain is being used for tracking |
| **Failed** | The CNAME was not found — check your DNS configuration |
| **Disconnected** | The domain was working but the CNAME has been removed |

> **Normal delay**: between 5 minutes and 1 hour. If your DNS has a high TTL, it can take up to 48h.

---

## Step 5: Verify everything works

Once the status is **Active**, you can test:

### Quick browser test

Open this URL in your browser:
```
https://t.user-domain.com/health
```

You should see **"OK"** — this confirms the domain is properly connected.

### Tracking pixel test

```
https://t.user-domain.com/t/test
```

You should see a blank page (this is normal — it's an invisible 1x1 pixel image).

---

## Troubleshooting

### "The status has been pending for over an hour"

1. **Check your CNAME** with an online tool:
   ```
   https://dnschecker.org/#CNAME/t.user-domain.com
   ```
   The result should show `fallback.integrator.com` (or the target provided by the platform).

2. **Check that the Cloudflare proxy is enabled** (if you use Cloudflare):
   - The cloud icon must be **orange** (Proxied)

3. **Wait for DNS propagation** — some providers take up to 48h but few minutes only with cloudflare

### "The status is Failed"

- The CNAME was not found or points to the wrong target
- Check the exact spelling of the subdomain and target
- Make sure there is no other record (A, AAAA) on the same subdomain — a CNAME cannot coexist with other record types

### "The status changed from Active to Disconnected"

- The CNAME has been deleted or modified
- Check that the CNAME record is still present in your DNS
- If you changed DNS providers, recreate the CNAME

### "The SSL certificate won't provision"

- Make sure your domain doesn't have a restrictive **CAA** record
- If you have a CAA record, add: `0 issue "digicert.com"` and `0 issue "letsencrypt.org"`
