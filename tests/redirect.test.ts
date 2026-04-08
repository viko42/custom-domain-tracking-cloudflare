import { describe, it, expect, vi, beforeEach } from "vitest";
import { signPayload } from "../src/sdk/signing";
import { handleRedirect } from "../src/worker/handlers/redirect";
import type { Env } from "../src/worker/index";

// Mock webhook to avoid network calls
vi.mock("../src/worker/webhook", () => ({
  fireWebhookAsync: vi.fn(),
}));

const SECRET = "test-secret-key-for-signing";
const HOSTNAME = "track.example.com";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUBDOMAINS: {} as Env["SUBDOMAINS"],
    CF_API_TOKEN: "fake",
    CF_ZONE_ID: "fake",
    FALLBACK_ORIGIN: "fallback.example.com",
    WEBHOOK_URL: "https://hook.example.com",
    WEBHOOK_SECRET: "webhook-secret-placeholder",
    TRACKING_SIGN_KEY: SECRET,
    RATE_LIMIT_ENABLED: "false",
    ...overrides,
  };
}

function makeCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function makeRequest(path: string, hostname = HOSTNAME): Request {
  return new Request(`https://${hostname}${path}`);
}

describe("handleRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redirect to the embedded payload.url", async () => {
    const token = await signPayload(SECRET, HOSTNAME, {
      userId: "abc",
      url: "https://destination.com/page",
    });
    const res = await handleRedirect(token, makeRequest(`/r/${token}`), makeEnv(), makeCtx());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://destination.com/page");
  });

  it("should redirect using ?url= query param when no payload.url", async () => {
    const token = await signPayload(SECRET, HOSTNAME, { userId: "abc" });
    const url = `https://${HOSTNAME}/r/${token}?url=${encodeURIComponent("https://fallback.com/page")}`;
    const req = new Request(url);
    const res = await handleRedirect(token, req, makeEnv(), makeCtx());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://fallback.com/page");
  });

  it("should prefer payload.url over ?url= query param", async () => {
    const token = await signPayload(SECRET, HOSTNAME, {
      userId: "abc",
      url: "https://signed.com/correct",
    });
    const url = `https://${HOSTNAME}/r/${token}?url=${encodeURIComponent("https://attacker.com/evil")}`;
    const req = new Request(url);
    const res = await handleRedirect(token, req, makeEnv(), makeCtx());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.com/correct");
  });

  it("should reject javascript: scheme via ?url= param", async () => {
    const token = await signPayload(SECRET, HOSTNAME, { userId: "abc" });
    const url = `https://${HOSTNAME}/r/${token}?url=${encodeURIComponent("javascript:alert(1)")}`;
    const req = new Request(url);
    const res = await handleRedirect(token, req, makeEnv(), makeCtx());
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid url scheme");
  });

  it("should reject data: scheme via ?url= param", async () => {
    const token = await signPayload(SECRET, HOSTNAME, { userId: "abc" });
    const url = `https://${HOSTNAME}/r/${token}?url=${encodeURIComponent("data:text/html,<script>alert(1)</script>")}`;
    const req = new Request(url);
    const res = await handleRedirect(token, req, makeEnv(), makeCtx());
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid url scheme");
  });

  it("should return 400 when no destination URL is provided", async () => {
    const token = await signPayload(SECRET, HOSTNAME, { userId: "abc" });
    const res = await handleRedirect(token, makeRequest(`/r/${token}`), makeEnv(), makeCtx());
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing destination url");
  });

  it("should return 400 for invalid URL string via ?url=", async () => {
    const token = await signPayload(SECRET, HOSTNAME, { userId: "abc" });
    const url = `https://${HOSTNAME}/r/${token}?url=${encodeURIComponent("not a url")}`;
    const req = new Request(url);
    const res = await handleRedirect(token, req, makeEnv(), makeCtx());
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid destination url");
  });

  it("should still redirect with invalid token when ?url= is valid", async () => {
    const res = await handleRedirect(
      "garbage-token",
      new Request(`https://${HOSTNAME}/r/garbage-token?url=${encodeURIComponent("https://example.com")}`),
      makeEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/");
  });

  it("should not fire webhook for invalid token", async () => {
    const { fireWebhookAsync } = await import("../src/worker/webhook");
    const res = await handleRedirect(
      "garbage-token",
      new Request(`https://${HOSTNAME}/r/garbage-token?url=${encodeURIComponent("https://example.com/")}`),
      makeEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(302);
    expect(fireWebhookAsync).not.toHaveBeenCalled();
  });
});
