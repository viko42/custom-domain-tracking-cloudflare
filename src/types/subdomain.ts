export type SubdomainStatus =
  | "pending"
  | "ssl_pending"
  | "active"
  | "failed"
  | "disconnected"
  | "deleting";

export interface Subdomain {
  hostname: string;
  cfCustomHostnameId: string;
  status: SubdomainStatus;
  createdAt: string;
  updatedAt: string;
  sslStatus: string | null;
  verificationErrors: string[];
  metadata: Record<string, string>;
}

export interface CreateSubdomainParams {
  hostname: string;
  metadata?: Record<string, string>;
}

export interface DeleteSubdomainParams {
  hostname: string;
}

export interface GetSubdomainParams {
  hostname: string;
}
