/**
 * Signing utilities for tracking IDs.
 *
 * A signed tracking ID is: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 * This ensures only IDs generated via the SDK will trigger webhooks.
 */

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  if (remainder === 2) padded += "==";
  else if (remainder === 3) padded += "=";
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a per-domain signing key from the master secret.
 * domainKey = HMAC-SHA256(masterSecret, hostname)
 */
async function deriveDomainKey(secret: string, hostname: string): Promise<CryptoKey> {
  const masterKey = await getKey(secret);
  const enc = new TextEncoder();
  const derived = await crypto.subtle.sign("HMAC", masterKey, enc.encode(hostname));
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type TokenFormat = "dotted" | "packed";

/**
 * Signs an arbitrary payload object into a tracking token, scoped to a specific hostname.
 *
 * - "dotted" (default): {base64Payload}.{base64Signature} — readable, two parts
 * - "packed": base64({payload}.{signature}) — single opaque token, no dots in the URL path
 */
export async function signPayload(
  secret: string,
  hostname: string,
  payload: Record<string, unknown>,
  format: TokenFormat = "dotted",
): Promise<string> {
  // Validate embedded URL if present — only http(s) allowed
  if (typeof payload.url === "string") {
    let parsed: URL;
    try {
      parsed = new URL(payload.url);
    } catch {
      throw new Error("payload.url is not a valid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("payload.url must use http: or https: scheme");
    }
  }

  const enc = new TextEncoder();
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await deriveDomainKey(secret, hostname);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const dotted = `${payloadB64}.${toBase64Url(sig)}`;

  if (format === "packed") {
    return toBase64Url(enc.encode(dotted));
  }
  return dotted;
}

/**
 * Verifies a signed tracking token against a specific hostname.
 * Accepts both dotted and packed formats automatically.
 * Returns the decoded payload if valid, null otherwise.
 */
export async function verifyToken(secret: string, hostname: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    // Try to unpack if no dot is found (packed format)
    let inner = token;
    if (!token.includes(".")) {
      const dec = new TextDecoder();
      inner = dec.decode(fromBase64Url(token));
    }

    const dotIndex = inner.indexOf(".");
    if (dotIndex === -1) {
      return null;
    }

    const payloadB64 = inner.substring(0, dotIndex);
    const sigB64 = inner.substring(dotIndex + 1);

    const key = await deriveDomainKey(secret, hostname);
    const enc = new TextEncoder();
    const sigBytes = fromBase64Url(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!valid) {
      return null;
    }

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }
}
