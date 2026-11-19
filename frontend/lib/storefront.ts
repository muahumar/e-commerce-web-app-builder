import { API_URL } from "./sa";

export { API_URL };

const custKey = (store: string) => `customer_token_${store}`;
const vendKey = (store: string) => `vendor_token_${store}`;
const guestKey = (store: string) => `guest_token_${store}`;

export const customerToken = {
  get: (store: string) => (typeof window === "undefined" ? null : localStorage.getItem(custKey(store))),
  set: (store: string, t: string) => localStorage.setItem(custKey(store), t),
  clear: (store: string) => localStorage.removeItem(custKey(store)),
};

export const vendorToken = {
  get: (store: string) => (typeof window === "undefined" ? null : localStorage.getItem(vendKey(store))),
  set: (store: string, t: string) => localStorage.setItem(vendKey(store), t),
  clear: (store: string) => localStorage.removeItem(vendKey(store)),
};

export function getGuestToken(store: string): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(guestKey(store));
  if (!t) {
    t = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(guestKey(store), t);
  }
  return t;
}

/** Server-side fetch for SSR storefront pages (SEO). */
export async function sfServerFetch<T>(store: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/store/${store}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Client-side fetch for cart, checkout, customer orders, reviews, and vendor portal. */
export async function sfFetch<T = unknown>(
  store: string,
  path: string,
  init: RequestInit & { json?: unknown; useVendor?: boolean } = {}
): Promise<T> {
  const { json, headers, useVendor, ...rest } = init;
  const tok = useVendor ? vendorToken.get(store) : customerToken.get(store);
  const guest = !useVendor && !tok ? getGuestToken(store) : "";
  const res = await fetch(`${API_URL}/store/${store}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(guest ? { "x-guest-token": guest } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const money = (n: number) => n.toLocaleString("en-PK", { style: "currency", currency: "PKR" });

export type StoreInfo = {
  businessName: string;
  subdomain: string;
  settings: { storeName?: string; logo?: string; banner?: string; colorPalette?: string; contactPhone?: string; contactEmail?: string; contactAddress?: string };
  features: { discountBadge?: boolean; multiVendor?: boolean; reviews?: boolean };
  theme: { name: string; colorPalettes: { name: string; primary: string; secondary: string }[] } | null;
};

export type SfCategory = { _id: string; name: string; order: number };

export type SfProduct = {
  _id: string;
  name: string;
  price: number;
  stock: number;
  images: string[];
  categoryId?: string;
  description?: string;
  variants?: { name: string; options: string[] }[];
  ratingAvg: number;
  ratingCount: number;
  sellerId?: string;
  sellerName?: string;
};

export type CartItem = { productId: string; name: string; price: number; stock: number; image: string | null; quantity: number; lineTotal: number };
export type CartData = { items: CartItem[]; subtotal: number };
export type SfOrder = {
  _id: string;
  status: string;
  subtotal?: number;
  discountAmount?: number;
  couponCode?: string;
  totalAmount: number;
  createdAt: string;
  items: { productId: string; name: string; price: number; quantity: number }[];
  shippingAddress?: { name?: string; line1?: string; city?: string };
};
export type SfReview = { _id: string; rating: number; comment?: string; customerName: string; createdAt: string };
