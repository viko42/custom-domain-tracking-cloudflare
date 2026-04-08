import type { WebhookEvent, SubdomainKVRecord, SubdomainStatus, DomainHeartbeatEvent } from "../../types/index.js";

export function buildStatusChangeEvent(
  record: SubdomainKVRecord,
  previousStatus: SubdomainStatus,
  newStatus: SubdomainStatus,
): WebhookEvent | null {
  const now = new Date().toISOString();

  if (previousStatus !== "active" && newStatus === "active") {
    return {
      type: "domain.verified",
      hostname: record.hostname,
      cfCustomHostnameId: record.cfCustomHostnameId,
      timestamp: now,
    };
  }

  if (newStatus === "failed" && previousStatus !== "failed") {
    return {
      type: "domain.failed",
      hostname: record.hostname,
      cfCustomHostnameId: record.cfCustomHostnameId,
      errors: record.verificationErrors,
      timestamp: now,
    };
  }

  if (previousStatus === "active" && newStatus === "disconnected") {
    return {
      type: "domain.disconnected",
      hostname: record.hostname,
      cfCustomHostnameId: record.cfCustomHostnameId,
      previousStatus,
      timestamp: now,
    };
  }

  return null;
}

export function buildHeartbeatEvent(record: SubdomainKVRecord): DomainHeartbeatEvent {
  return {
    type: "domain.heartbeat",
    hostname: record.hostname,
    cfCustomHostnameId: record.cfCustomHostnameId,
    timestamp: new Date().toISOString(),
  };
}
