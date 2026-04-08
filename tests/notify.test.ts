import { describe, it, expect } from "vitest";
import { buildStatusChangeEvent, buildHeartbeatEvent } from "../src/worker/cron/notify";
import type { SubdomainKVRecord } from "../src/types/index";

function makeRecord(overrides: Partial<SubdomainKVRecord> = {}): SubdomainKVRecord {
  return {
    hostname: "track.example.com",
    cfCustomHostnameId: "cf-id-123",
    status: "active",
    previousStatus: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    sslStatus: "active",
    verificationErrors: [],
    metadata: {},
    ...overrides,
  };
}

describe("buildStatusChangeEvent", () => {
  it("should return domain.verified when transitioning to active", () => {
    const record = makeRecord();
    const event = buildStatusChangeEvent(record, "pending", "active");

    expect(event).not.toBeNull();
    expect(event!.type).toBe("domain.verified");
    expect(event!.hostname).toBe("track.example.com");
  });

  it("should return domain.failed when transitioning to failed", () => {
    const record = makeRecord({
      status: "failed",
      verificationErrors: ["DNS not found"],
    });
    const event = buildStatusChangeEvent(record, "pending", "failed");

    expect(event).not.toBeNull();
    expect(event!.type).toBe("domain.failed");
    if (event!.type === "domain.failed") {
      expect(event!.errors).toEqual(["DNS not found"]);
    }
  });

  it("should return domain.disconnected when active becomes disconnected", () => {
    const record = makeRecord({ status: "disconnected" });
    const event = buildStatusChangeEvent(record, "active", "disconnected");

    expect(event).not.toBeNull();
    expect(event!.type).toBe("domain.disconnected");
  });

  it("should return null for non-matching transitions", () => {
    const record = makeRecord({ status: "ssl_pending" });
    const event = buildStatusChangeEvent(record, "pending", "ssl_pending");

    expect(event).toBeNull();
  });

  it("should return null when already failed and staying failed", () => {
    const record = makeRecord({ status: "failed" });
    const event = buildStatusChangeEvent(record, "failed", "failed");

    expect(event).toBeNull();
  });
});

describe("buildHeartbeatEvent", () => {
  it("should return a domain.heartbeat event", () => {
    const record = makeRecord();
    const event = buildHeartbeatEvent(record);

    expect(event.type).toBe("domain.heartbeat");
    expect(event.hostname).toBe("track.example.com");
    expect(event.cfCustomHostnameId).toBe("cf-id-123");
    expect(event.timestamp).toBeTruthy();
  });
});
