import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, type RateLimitConfig } from "../src/worker/ratelimit";

// Minimal KV mock
function createKVMock(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
  } as unknown as KVNamespace;
}

function makeConfig(kv: KVNamespace): RateLimitConfig {
  return { enabled: true, kv };
}

describe("isRateLimited", () => {
  let kv: KVNamespace;
  let config: RateLimitConfig;

  beforeEach(() => {
    kv = createKVMock();
    config = makeConfig(kv);
  });

  it("should always allow when disabled", async () => {
    const disabled = { enabled: false, kv };
    const result = await isRateLimited(disabled, "1.2.3.4", "test-id");
    expect(result).toBe(false);
  });

  it("should allow the first request", async () => {
    const result = await isRateLimited(config, "1.2.3.4", "test-id");
    expect(result).toBe(false);
  });

  it("should allow up to 50 requests", async () => {
    for (let i = 0; i < 50; i++) {
      const result = await isRateLimited(config, "1.2.3.4", "test-id");
      expect(result).toBe(false);
    }
  });

  it("should block after 50 requests", async () => {
    for (let i = 0; i < 50; i++) {
      await isRateLimited(config, "1.2.3.4", "test-id");
    }
    const result = await isRateLimited(config, "1.2.3.4", "test-id");
    expect(result).toBe(true);
  });

  it("should track different IPs independently", async () => {
    for (let i = 0; i < 50; i++) {
      await isRateLimited(config, "1.2.3.4", "test-id");
    }
    const result = await isRateLimited(config, "5.6.7.8", "test-id");
    expect(result).toBe(false);
  });

  it("should track different route keys independently", async () => {
    for (let i = 0; i < 50; i++) {
      await isRateLimited(config, "1.2.3.4", "id-a");
    }
    const result = await isRateLimited(config, "1.2.3.4", "id-b");
    expect(result).toBe(false);
  });
});
