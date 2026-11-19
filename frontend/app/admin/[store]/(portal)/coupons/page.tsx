"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, type Coupon } from "@/lib/admin";
import { money } from "@/lib/storefront";
import { Messages, inputCls, useAction, useAdminData } from "@/lib/useAdminData";

const empty = { code: "", discountType: "percent", value: "", expiryDate: "", usageLimit: "" };

export default function CouponsPage() {
  const { store } = useParams<{ store: string }>();
  const { data, error: loadErr, reload } = useAdminData<{ items: Coupon[] }>(store, "/coupons");
  const { run, error } = useAction(reload);
  const [form, setForm] = useState(empty);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const body = { code: form.code, discountType: form.discountType, value: Number(form.value), ...(form.expiryDate && { expiryDate: form.expiryDate }), ...(form.usageLimit && { usageLimit: Number(form.usageLimit) }) };
    if (await run(() => adminFetch(store, "/coupons", { method: "POST", json: body }))) setForm(empty);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Coupons</h1>
        <p className="mt-1 text-sm text-slate-500">Create promotional discount codes for checkout.</p>
      </div>
      <Messages error={error || loadErr} />
      <form onSubmit={create} className="grid max-w-3xl grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <input className={inputCls} placeholder="CODE (e.g. SAVE10)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <select className={inputCls} value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="percent">Percent %</option><option value="flat">Flat amount (PKR)</option></select>
        <input className={inputCls} type="number" min="0" step="0.01" placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        <label className="text-xs font-semibold text-slate-600">Expiry<input className={`${inputCls} mt-1 w-full`} type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
        <label className="text-xs font-semibold text-slate-600">Usage limit<input className={`${inputCls} mt-1 w-full`} type="number" min="0" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /></label>
        <button className="self-end rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">Create Coupon</button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Used</th><th className="px-4 py-3">Active</th><th className="px-6 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((c) => (
              <tr key={c._id} className="hover:bg-slate-50/70">
                <td className="px-6 py-3.5"><span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">{c.code}</span></td>
                <td className="px-4 py-3.5 font-medium text-slate-900">{c.discountType === "percent" ? `${c.value}%` : money(c.value)}</td>
                <td className="px-4 py-3.5 text-slate-500">{c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3.5 text-slate-600">{c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</td>
                <td className="px-4 py-3.5"><input type="checkbox" checked={c.active} onChange={(e) => run(() => adminFetch(store, `/coupons/${c._id}`, { method: "PATCH", json: { active: e.target.checked } }))} /></td>
                <td className="px-6 py-3.5 text-right"><button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => window.confirm(`Delete ${c.code}?`) && run(() => adminFetch(store, `/coupons/${c._id}`, { method: "DELETE" }))}>Delete</button></td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No coupons yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
