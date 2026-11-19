"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/sa";
import { money } from "@/lib/storefront";

type Row = { tenantId: string; businessName: string; subdomain: string; status: string; plan: string | null; products: number; orders: number; revenue: number; commission: number };
type Analytics = {
  totalTenants: number;
  tenantsByStatus: Record<string, number>;
  totalOrders: number;
  totalRevenue: number;
  totalCommission: number;
  perTenant: Row[];
};

const statusBadge: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  suspended: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  trial_expired: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export default function Dashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    saFetch<Analytics>("/analytics").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading platform analytics…</div>;

  const cards: { label: string; value: string; accent: string }[] = [
    { label: "Total Tenants", value: String(data.totalTenants), accent: "border-l-red-800" },
    { label: "Active Stores", value: String(data.tenantsByStatus.active ?? 0), accent: "border-l-emerald-600" },
    { label: "Suspended", value: String(data.tenantsByStatus.suspended ?? 0), accent: "border-l-rose-600" },
    { label: "Total Orders", value: String(data.totalOrders), accent: "border-l-amber-600" },
    { label: "Platform Revenue", value: money(data.totalRevenue), accent: "border-l-red-700" },
    { label: "Commission Earned", value: money(data.totalCommission), accent: "border-l-stone-700" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Real-time aggregate metrics across all provisioned stores.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border border-slate-200 border-l-4 ${c.accent} bg-white p-5 shadow-sm`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{c.label}</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Usage by Tenant</h2>
          <p className="text-xs text-slate-500">Aggregate figures only; individual tenant product and customer records are isolated.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3">Store</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-6 py-3">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.perTenant.map((t) => (
                <tr key={t.tenantId} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3.5 font-medium text-slate-900">
                    {t.businessName} <span className="ml-1 font-mono text-xs text-slate-400">/{t.subdomain}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{t.plan ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadge[t.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{t.products}</td>
                  <td className="px-4 py-3.5 text-slate-600">{t.orders}</td>
                  <td className="px-4 py-3.5 font-medium text-slate-900">{money(t.revenue)}</td>
                  <td className="px-6 py-3.5 font-medium text-emerald-700">{money(t.commission)}</td>
                </tr>
              ))}
              {!data.perTenant.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No tenants provisioned yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
