import { describe, it, expect } from "vitest";
import { mapCFStatus } from "../src/worker/cron/verify";
import type { CFCustomHostname, SubdomainKVRecord } from "../src/types/index";

function makeRecord(status: SubdomainKVRecord["status"] = "pending"): SubdomainKVRecord {
  return {
    hostname: "track.example.com",
    cfCustomHostnameId: "cf-id-123",
    status,
    previousStatus: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    sslStatus: "pending_validation",
    verificationErrors: [],
    metadata: {},
  };
}

function makeCF(overrides: Partial<CFCustomHostname> = {}): CFCustomHostname {
  return {
    id: "cf-id-123",
    hostname: "track.example.com",
    status: "active",
    ssl: { status: "active" },
    verification_errors: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as CFCustomHostname;
}

describe("mapCFStatus", () => {
  it("should return active when both hostname and ssl are active", () => {
    const result = mapCFStatus(makeCF(), makeRecord());
    expect(result).toBe("active");
  });

  it("should return ssl_pending when ssl is pending_validation", () => {
    const cf = makeCF({ ssl: { status: "pending_validation" } } as Partial<CFCustomHostname>);
    expect(mapCFStatus(cf, makeRecord())).toBe("ssl_pending");
  });

  it("should return ssl_pending when ssl is initializing", () => {
    const cf = makeCF({ ssl: { status: "initializing" } } as Partial<CFCustomHostname>);
    expect(mapCFStatus(cf, makeRecord())).toBe("ssl_pending");
  });

  it("should return pending when hostname status is pending", () => {
    const cf = makeCF({ status: "pending", ssl: { status: "pending_validation" } } as Partial<CFCustomHostname>);
    // ssl_pending takes precedence over pending
    expect(mapCFStatus(cf, makeRecord())).toBe("ssl_pending");
  });

  it("should return disconnected when hostname is moved and was active", () => {
    const cf = makeCF({ status: "moved", ssl: { status: "active" } } as Partial<CFCustomHostname>);
    expect(mapCFStatus(cf, makeRecord("active"))).toBe("disconnected");
  });

  it("should return failed when hostname is deleted and was not active", () => {
    const cf = makeCF({ status: "deleted", ssl: { status: "active" } } as Partial<CFCustomHostname>);
    expect(mapCFStatus(cf, makeRecord("pending"))).toBe("failed");
  });

  it("should return failed when ssl has validation errors", () => {
    const cf = makeCF({
      status: "active",
      ssl: { status: "pending_validation", validation_errors: [{ message: "err" }] },
    } as Partial<CFCustomHostname>);
    // ssl_pending takes precedence because it's checked first
    expect(mapCFStatus(cf, makeRecord())).toBe("ssl_pending");
  });
});
