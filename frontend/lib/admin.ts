import { API_URL } from "./sa";

export { API_URL };

const key = (store: string) => `admin_token_${store}`; // Super Admin impersonation writes the same key

export const adminToken = {
  get: (store: string) => (typeof window === "undefined" ? null : localStorage.getItem(key(store))),
  set: (store: string, t: string) => localStorage.setItem(key(store), t),
  clear: (store: string) => localStorage.removeItem(key(store)),
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Fetch against /store/:slug/admin/... as the logged-in Client Admin. 401 clears the session. */
export async function adminFetch<T = unknown>(store: string, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = adminToken.get(store);
  const res = await fetch(`${API_URL}/store/${store}/admin${path}`, {
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
    if (res.status === 401 && token) {
      adminToken.clear(store);
      window.location.assign(`/admin/${store}/login`);
    }
    throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export async function uploadImage(store: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const r = await adminFetch<{ url: string }>(store, "/uploads", { method: "POST", body: fd });
  return r.url;
}

/* ---- types ---- */
export type Category = { _id: string; name: string; order: number; productCount?: number };
export type Product = {
  _id: string;
  name: string;
  price: number;
  stock: number;
  images: string[];
  categoryId?: string;
  description?: string;
  variants: { name: string; options: string[] }[];
  published: boolean;
};
export type Order = {
  _id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: { name: string; price: number; quantity: number }[];
  customer: { name: string; email: string } | null;
  allowedNext: string[];
};
export type Coupon = { _id: string; code: string; discountType: "percent" | "flat"; value: number; expiryDate?: string; usageLimit?: number; usedCount: number; active: boolean };
export type Review = { _id: string; productName?: string; customerName?: string; rating: number; comment?: string; approved: boolean };
export type Person = { id: string; name: string; email: string; role: string; status: string; productCount?: number };
