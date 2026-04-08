import type {
  Subdomain,
  CreateSubdomainParams,
  DeleteSubdomainParams,
  GetSubdomainParams,
  SubdomainKVRecord,
} from "../types/index.js";
import { CloudflareClient } from "./client.js";
import {
  getSubdomainRecord,
  putSubdomainRecord,
  deleteSubdomainRecord,
  getAllHostnames,
  addToIndex,
  removeFromIndex,
} from "./kv.js";
import { signPayload, type TokenFormat } from "./signing.js";

export interface SDKConfig {
  cfApiToken: string;
  cfZoneId: string;
  webhookUrl: string;
  kvNamespace: KVNamespace;
  signingSecret: string;
}

function recordToSubdomain(record: SubdomainKVRecord): Subdomain {
  return {
    hostname: record.hostname,
    cfCustomHostnameId: record.cfCustomHostnameId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sslStatus: record.sslStatus,
    verificationErrors: record.verificationErrors,
    metadata: record.metadata,
  };
}

export function createSDK(config: SDKConfig) {
  const client = new CloudflareClient(config.cfApiToken, config.cfZoneId);
  const kv = config.kvNamespace;

  return {
    async createSubdomain(params: CreateSubdomainParams): Promise<Subdomain> {
      const existing = await getSubdomainRecord(kv, params.hostname);
      if (existing) {
        throw new Error(`Subdomain ${params.hostname} already exists`);
      }

      const cfHostname = await client.createCustomHostname(params.hostname);
      const now = new Date().toISOString();

      const record: SubdomainKVRecord = {
        hostname: params.hostname,
        cfCustomHostnameId: cfHostname.id,
        status: "pending",
        previousStatus: null,
        createdAt: now,
        updatedAt: now,
        sslStatus: cfHostname.ssl.status,
        verificationErrors: [],
        metadata: params.metadata ?? {},
      };

      await putSubdomainRecord(kv, record);
      await addToIndex(kv, params.hostname);

      return recordToSubdomain(record);
    },

    async deleteSubdomain(params: DeleteSubdomainParams): Promise<void> {
      const record = await getSubdomainRecord(kv, params.hostname);
      if (!record) {
        throw new Error(`Subdomain ${params.hostname} not found`);
      }

      await client.deleteCustomHostname(record.cfCustomHostnameId);
      await deleteSubdomainRecord(kv, params.hostname);
      await removeFromIndex(kv, params.hostname);
    },

    async getSubdomain(params: GetSubdomainParams): Promise<Subdomain | null> {
      const record = await getSubdomainRecord(kv, params.hostname);
      return record ? recordToSubdomain(record) : null;
    },

    async generateTrackingId(hostname: string, payload: Record<string, unknown>, format: TokenFormat = "packed"): Promise<string> {
      return signPayload(config.signingSecret, hostname, payload, format);
    },

    async listSubdomains(): Promise<Subdomain[]> {
      const hostnames = await getAllHostnames(kv);
      const records = await Promise.all(
        hostnames.map((hostname) => getSubdomainRecord(kv, hostname)),
      );
      return records.filter((r): r is SubdomainKVRecord => r !== null).map(recordToSubdomain);
    },
  };
}

export type DomainTrackingSDK = ReturnType<typeof createSDK>;

export { signPayload, verifyToken, type TokenFormat } from "./signing.js";
