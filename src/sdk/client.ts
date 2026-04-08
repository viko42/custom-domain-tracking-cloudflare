import type { CFCustomHostname, CFApiResponse, CFListResponse } from "../types/index.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareClient {
  private apiToken: string;
  private zoneId: string;

  constructor(apiToken: string, zoneId: string) {
    this.apiToken = apiToken;
    this.zoneId = zoneId;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  private get baseUrl(): string {
    return `${CF_API_BASE}/zones/${this.zoneId}/custom_hostnames`;
  }

  async createCustomHostname(hostname: string): Promise<CFCustomHostname> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        hostname,
        ssl: {
          method: "http",
          type: "dv",
          settings: {
            min_tls_version: "1.2",
          },
        },
      }),
    });

    const data = (await response.json()) as CFApiResponse<CFCustomHostname>;
    if (!data.success) {
      throw new Error(
        `Failed to create custom hostname: ${data.errors.map((e) => e.message).join(", ")}`,
      );
    }
    return data.result;
  }

  async getCustomHostname(cfId: string): Promise<CFCustomHostname> {
    const response = await fetch(`${this.baseUrl}/${cfId}`, {
      method: "GET",
      headers: this.headers,
    });

    const data = (await response.json()) as CFApiResponse<CFCustomHostname>;
    if (!data.success) {
      throw new Error(
        `Failed to get custom hostname: ${data.errors.map((e) => e.message).join(", ")}`,
      );
    }
    return data.result;
  }

  async deleteCustomHostname(cfId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${cfId}`, {
      method: "DELETE",
      headers: this.headers,
    });

    const data = (await response.json()) as CFApiResponse<unknown>;
    if (!data.success) {
      throw new Error(
        `Failed to delete custom hostname: ${data.errors.map((e) => e.message).join(", ")}`,
      );
    }
  }

  async listCustomHostnames(page = 1, perPage = 50): Promise<CFListResponse<CFCustomHostname>> {
    const url = `${this.baseUrl}?page=${page}&per_page=${perPage}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    const data = (await response.json()) as CFListResponse<CFCustomHostname>;
    if (!data.success) {
      throw new Error(
        `Failed to list custom hostnames: ${data.errors.map((e) => e.message).join(", ")}`,
      );
    }
    return data;
  }
}
