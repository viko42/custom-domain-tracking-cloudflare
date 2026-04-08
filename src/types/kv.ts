import type { SubdomainStatus } from "./subdomain.js";

export interface SubdomainKVRecord {
  hostname: string;
  cfCustomHostnameId: string;
  status: SubdomainStatus;
  previousStatus: SubdomainStatus | null;
  createdAt: string;
  updatedAt: string;
  sslStatus: string | null;
  verificationErrors: string[];
  metadata: Record<string, string>;
}
