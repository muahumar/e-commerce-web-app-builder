"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAdminData, Messages, inputCls, money } from "@/lib/useAdminData";

type Report = {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  daily: { date: string; revenue: number; orders: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const { store } = useParams<{ store: string }>();
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const { data, error } = useAdminData<Report>(store, `/reports?from=${from}&to=${to}`);
  const max = Math.max(1, ...(data?.daily.map((d) => d.revenue) ?? []));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sales Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Revenue, order volume, and top products (cancelled orders excluded).</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input className={inputCls} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">to</span>
          <input className={inputCls} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <Messages error={error} />
      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([["Revenue", money(data.revenue)], ["Orders", data.orderCount], ["Avg Order Value", money(data.averageOrderValue)]] as const).map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{l}</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">{v}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Daily Revenue</h2>
            <div className="mt-4 space-y-2">
              {data.daily.map((d) => (
                <div key={d.date} className="flex items-center gap-3 text-xs">
                  <span className="w-24 font-mono text-slate-500">{d.date}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-600" style={{ width: `${(d.revenue / max) * 100}%`, minWidth: 4 }} />
                  </div>
                  <span className="w-28 text-right font-medium text-slate-700">{money(d.revenue)} ({d.orders})</span>
                </div>
              ))}
              {!data.daily.length && <p className="text-sm text-slate-500">No sales in this range.</p>}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Top Products</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-3">Product</th><th className="px-4 py-3">Units</th><th className="px-6 py-3">Revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topProducts.map((p) => <tr key={p.productId}><td className="px-6 py-3 font-medium text-slate-900">{p.name}</td><td className="px-4 py-3 text-slate-600">{p.unitsSold}</td><td className="px-6 py-3 font-medium text-slate-900">{money(p.revenue)}</td></tr>)}
                {!data.topProducts.length && <tr><td colSpan={3} className="px-6 py-6 text-center text-slate-500">—</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
