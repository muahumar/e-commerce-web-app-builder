"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { customerToken, money, sfFetch, type SfOrder } from "@/lib/storefront";

const noop = () => () => {};

export default function OrdersPage() {
  const { store } = useParams<{ store: string }>();
  const [orders, setOrders] = useState<SfOrder[] | null>(null);
  const [error, setError] = useState("");
  const authed = useSyncExternalStore(noop, () => !!customerToken.get(store), () => null);

  useEffect(() => {
    if (!authed) return;
    sfFetch<{ items: SfOrder[] }>(store, "/orders")
      .then((r) => setOrders(r.items))
      .catch((e) => setError(e.message));
  }, [store, authed]);

  if (authed === null) return null;

  if (!authed) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Order History</h1>
        <p className="mt-3 text-sm text-gray-600">Sign in to view your orders.</p>
        <Link href={`/${store}/account`} className="mt-3 inline-block rounded bg-black px-4 py-2 text-sm text-white">Go to Account</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">My Orders</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {!orders ? (
        <p className="mt-4 text-sm">Loading…</p>
      ) : !orders.length ? (
        <p className="mt-4 text-sm text-gray-500">You haven&apos;t placed any orders yet.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => (
            <div key={o._id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <span className="font-mono text-xs">Order #{o._id.slice(-8)}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize">{o.status}</span>
                <span className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleString()}</span>
                <span className="font-semibold">{money(o.totalAmount)}</span>
              </div>
              <ul className="mt-2 space-y-1 text-gray-700">
                {o.items.map((i, idx) => (
                  <li key={idx}>{i.quantity}× {i.name} ({money(i.price)})</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
