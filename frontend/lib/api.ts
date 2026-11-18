export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

/** Platform-level request (Super Admin, no tenant). */
export async function platformFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Tenant-scoped request: tenant slug travels in the URL path (/store/:slug/...). */
export async function tenantFetch<T>(store: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/store/${store}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
