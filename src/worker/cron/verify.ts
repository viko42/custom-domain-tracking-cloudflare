import type { SubdomainStatus, CFCustomHostname, SubdomainKVRecord } from "../../types/index.js";
import { CloudflareClient } from "../../sdk/client.js";
import { getSubdomainRecord, putSubdomainRecord } from "../../sdk/kv.js";

export interface VerificationResult {
  hostname: string;
  previousStatus: SubdomainStatus;
  newStatus: SubdomainStatus;
  changed: boolean;
  record: SubdomainKVRecord;
}

export function mapCFStatus(cf: CFCustomHostname, current: SubdomainKVRecord): SubdomainStatus {
  if (cf.status === "active" && cf.ssl.status === "active") {
    return "active";
  }

  if (cf.ssl.status === "pending_validation" || cf.ssl.status === "initializing") {
    return "ssl_pending";
  }

  if (cf.status === "pending") {
    return "pending";
  }

  if (
    cf.status === "moved" ||
    cf.status === "pending_deletion" ||
    cf.status === "deleted"
  ) {
    return current.status === "active" ? "disconnected" : "failed";
  }

  if (cf.ssl.validation_errors && cf.ssl.validation_errors.length > 0) {
    return "failed";
  }

  return current.status;
}

export async function verifyHostname(
  client: CloudflareClient,
  kv: KVNamespace,
  hostname: string,
): Promise<VerificationResult | null> {
  const record = await getSubdomainRecord(kv, hostname);
  if (!record) {
    return null;
  }

  let cfHostname: CFCustomHostname;
  try {
    cfHostname = await client.getCustomHostname(record.cfCustomHostnameId);
  } catch (err) {
    console.error(`Failed to fetch CF hostname for ${hostname}:`, err);
    return null;
  }

  const newStatus = mapCFStatus(cfHostname, record);
  const changed = newStatus !== record.status;

  const updatedRecord: SubdomainKVRecord = {
    ...record,
    previousStatus: record.status,
    status: newStatus,
    sslStatus: cfHostname.ssl.status,
    verificationErrors: cfHostname.verification_errors ?? [],
    updatedAt: new Date().toISOString(),
  };

  if (changed) {
    await putSubdomainRecord(kv, updatedRecord);
  }

  return {
    hostname,
    previousStatus: record.status,
    newStatus,
    changed,
    record: updatedRecord,
  };
}
