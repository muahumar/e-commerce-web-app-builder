"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, type Order } from "@/lib/admin";
import { Messages, inputCls, money, useAction, useAdminData } from "@/lib/useAdminData";

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default function OrdersPage() {
  const { store } = useParams<{ store: string }>();
  const [status, setStatus] = useState("");
  const { data, error: loadErr, reload } = useAdminData<{ items: Order[]; total: number }>(store, `/orders?limit=100${status ? `&status=${status}` : ""}`);
  const { run, error } = useAction(reload);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Track and advance fulfillment status for customer orders.</p>
        </div>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Messages error={error || loadErr} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Placed</th><th className="px-6 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((o) => (
              <tr key={o._id} className="align-top hover:bg-slate-50/70">
                <td className="px-6 py-3.5 font-mono text-xs text-slate-500">#{o._id.slice(-8)}</td>
                <td className="px-4 py-3.5"><div className="font-medium text-slate-900">{o.customer?.name}</div><div className="text-xs text-slate-500">{o.customer?.email}</div></td>
                <td className="px-4 py-3.5 text-slate-600">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</td>
                <td className="px-4 py-3.5 font-semibold text-slate-900">{money(o.totalAmount)}</td>
                <td className="px-4 py-3.5 text-xs text-slate-500">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="px-6 py-3.5">
                  {o.allowedNext.length ? (
                    <select className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800" value={o.status} onChange={(e) => run(() => adminFetch(store, `/orders/${o._id}/status`, { method: "PATCH", json: { status: e.target.value } }))}>
                      <option value={o.status}>{o.status}</option>
                      {o.allowedNext.map((s) => <option key={s} value={s}>→ {s}</option>)}
                    </select>
                  ) : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">{o.status}</span>}
                </td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No orders found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
