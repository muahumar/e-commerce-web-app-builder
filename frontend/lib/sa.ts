export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

const TOKEN_KEY = "sa_token";

export const saToken = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Fetch against the Super Admin API. Throws Error(message) on failure; 401 logs the user out. */
export async function saFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = saToken.get();
  const res = await fetch(`${API_URL}/superadmin${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && typeof window !== "undefined") {
      saToken.clear();
      window.location.assign("/superadmin/login");
    }
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/* ---- shared types ---- */
export type Features = { discountBadge: boolean; multiVendor: boolean; reviews: boolean };
export type Plan = {
  _id: string;
  name: string;
  maxProducts: number;
  maxAdmins: number;
  priceMonthly: number;
  commissionPercent: number;
  allowedFeatures: Features;
  tenantCount?: number;
};
export type Theme = { _id: string; name: string; description?: string; active: boolean };
export type Tenant = {
  _id: string;
  businessName: string;
  subdomain: string;
  contactEmail: string;
  status: "active" | "suspended" | "trial_expired";
  plan: { _id: string; name: string } | null;
  theme?: { _id: string; name: string } | null;
  createdAt: string;
};
