import { describe, it, expect } from "vitest";
import { signPayload, verifyToken } from "../src/sdk/signing";

const SECRET = "test-secret-key-for-signing";
const HOSTNAME = "track.example.com";

describe("signPayload + verifyToken", () => {
  it("should sign and verify a payload (dotted format)", async () => {
    const payload = { userId: "abc-123", campaignId: "welcome" };
    const token = await signPayload(SECRET, HOSTNAME, payload, "dotted");

    expect(token).toContain(".");

    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("should sign and verify a payload (packed format)", async () => {
    const payload = { userId: "abc-123", campaignId: "welcome" };
    const token = await signPayload(SECRET, HOSTNAME, payload, "packed");

    // Packed format should not contain a dot
    expect(token).not.toContain(".");

    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("should default to dotted format", async () => {
    const payload = { foo: "bar" };
    const token = await signPayload(SECRET, HOSTNAME, payload);

    expect(token).toContain(".");
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("should reject a tampered token", async () => {
    const payload = { userId: "abc-123" };
    const token = await signPayload(SECRET, HOSTNAME, payload, "dotted");

    // Tamper with the payload part
    const tampered = "dGFtcGVyZWQ." + token.split(".")[1];
    const result = await verifyToken(SECRET, HOSTNAME, tampered);
    expect(result).toBeNull();
  });

  it("should reject a token signed for a different domain", async () => {
    const payload = { userId: "abc-123" };
    const token = await signPayload(SECRET, HOSTNAME, payload, "dotted");

    const result = await verifyToken(SECRET, "other.example.com", token);
    expect(result).toBeNull();
  });

  it("should reject a token signed with a different secret", async () => {
    const payload = { userId: "abc-123" };
    const token = await signPayload(SECRET, HOSTNAME, payload, "dotted");

    const result = await verifyToken("wrong-secret-key-here!!", HOSTNAME, token);
    expect(result).toBeNull();
  });

  it("should reject garbage input", async () => {
    expect(await verifyToken(SECRET, HOSTNAME, "not-a-token")).toBeNull();
    expect(await verifyToken(SECRET, HOSTNAME, "")).toBeNull();
    expect(await verifyToken(SECRET, HOSTNAME, "a.b.c")).toBeNull();
  });

  it("should handle empty payload", async () => {
    const token = await signPayload(SECRET, HOSTNAME, {}, "dotted");
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual({});
  });

  it("should handle complex nested payload", async () => {
    const payload = {
      userId: "abc",
      meta: { campaign: "welcome", variant: 2 },
      tags: ["a", "b"],
    };
    const token = await signPayload(SECRET, HOSTNAME, payload, "packed");
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("packed token signed for one domain should fail on another", async () => {
    const payload = { userId: "abc" };
    const token = await signPayload(SECRET, HOSTNAME, payload, "packed");

    const result = await verifyToken(SECRET, "evil.example.com", token);
    expect(result).toBeNull();
  });
});

describe("signPayload URL validation", () => {
  it("should allow payload with valid http URL", async () => {
    const payload = { userId: "abc", url: "http://example.com/page" };
    const token = await signPayload(SECRET, HOSTNAME, payload);
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("should allow payload with valid https URL", async () => {
    const payload = { userId: "abc", url: "https://example.com/page?q=1" };
    const token = await signPayload(SECRET, HOSTNAME, payload);
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("should allow payload without a url field", async () => {
    const payload = { userId: "abc", campaignId: "test" };
    const token = await signPayload(SECRET, HOSTNAME, payload);
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });

  it("should reject javascript: scheme in payload.url", async () => {
    const payload = { userId: "abc", url: "javascript:alert(1)" };
    await expect(signPayload(SECRET, HOSTNAME, payload)).rejects.toThrow("payload.url must use http: or https: scheme");
  });

  it("should reject data: scheme in payload.url", async () => {
    const payload = { userId: "abc", url: "data:text/html,<script>alert(1)</script>" };
    await expect(signPayload(SECRET, HOSTNAME, payload)).rejects.toThrow("payload.url must use http: or https: scheme");
  });

  it("should reject vbscript: scheme in payload.url", async () => {
    const payload = { userId: "abc", url: "vbscript:MsgBox(1)" };
    await expect(signPayload(SECRET, HOSTNAME, payload)).rejects.toThrow("payload.url must use http: or https: scheme");
  });

  it("should reject invalid URL string in payload.url", async () => {
    const payload = { userId: "abc", url: "not a url at all" };
    await expect(signPayload(SECRET, HOSTNAME, payload)).rejects.toThrow("payload.url is not a valid URL");
  });

  it("should ignore non-string url values in payload", async () => {
    // url is a number, not a string — should be ignored by validation
    const payload = { userId: "abc", url: 12345 };
    const token = await signPayload(SECRET, HOSTNAME, payload as Record<string, unknown>);
    const result = await verifyToken(SECRET, HOSTNAME, token);
    expect(result).toEqual(payload);
  });
});
