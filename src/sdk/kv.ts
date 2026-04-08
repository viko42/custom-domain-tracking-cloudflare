import type { SubdomainKVRecord } from "../types/index.js";

const SUBDOMAIN_PREFIX = "subdomain:";
const INDEX_KEY = "index:all";

export function subdomainKey(hostname: string): string {
  return `${SUBDOMAIN_PREFIX}${hostname}`;
}

export async function getSubdomainRecord(
  kv: KVNamespace,
  hostname: string,
): Promise<SubdomainKVRecord | null> {
  return kv.get<SubdomainKVRecord>(subdomainKey(hostname), "json");
}

export async function putSubdomainRecord(
  kv: KVNamespace,
  record: SubdomainKVRecord,
): Promise<void> {
  await kv.put(subdomainKey(record.hostname), JSON.stringify(record));
}

export async function deleteSubdomainRecord(kv: KVNamespace, hostname: string): Promise<void> {
  await kv.delete(subdomainKey(hostname));
}

export async function getAllHostnames(kv: KVNamespace): Promise<string[]> {
  const data = await kv.get<string[]>(INDEX_KEY, "json");
  return data ?? [];
}

export async function addToIndex(kv: KVNamespace, hostname: string): Promise<void> {
  const hostnames = await getAllHostnames(kv);
  if (!hostnames.includes(hostname)) {
    hostnames.push(hostname);
    await kv.put(INDEX_KEY, JSON.stringify(hostnames));
  }
}

export async function removeFromIndex(kv: KVNamespace, hostname: string): Promise<void> {
  const hostnames = await getAllHostnames(kv);
  const filtered = hostnames.filter((h) => h !== hostname);
  await kv.put(INDEX_KEY, JSON.stringify(filtered));
}
