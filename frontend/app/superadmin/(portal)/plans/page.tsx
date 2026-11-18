"use client";

import { useCallback, useEffect, useState } from "react";
import { saFetch, type Features, type Plan } from "@/lib/sa";

const FEATURE_LABELS: [keyof Features, string][] = [
  ["discountBadge", "Discount badges"],
  ["multiVendor", "Multi-vendor"],
  ["reviews", "Reviews"],
];

const empty = { name: "", maxProducts: 50, maxAdmins: 2, priceMonthly: 0, commissionPercent: 0, allowedFeatures: { discountBadge: false, multiVendor: false, reviews: true } };

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    saFetch<{ items: Plan[] }>("/plans").then((r) => setPlans(r.items)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await saFetch(editing ? `/plans/${editing}` : "/plans", { method: editing ? "PATCH" : "POST", json: form });
      setForm(empty);
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(p: Plan) {
    if (!window.confirm(`Delete plan ${p.name}?`)) return;
    try {
      await saFetch(`/plans/${p._id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const num = (k: "maxProducts" | "maxAdmins" | "priceMonthly" | "commissionPercent") => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) }),
  });
  const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscription Plans</h1>
        <p className="mt-1 text-sm text-slate-500">Define resource limits, commission rates, and allowed feature toggles.</p>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <form onSubmit={save} className="grid max-w-4xl grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Plan Name<input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="text-xs font-semibold text-slate-600">Max Products<input className={input} type="number" min={0} {...num("maxProducts")} /></label>
        <label className="text-xs font-semibold text-slate-600">Max Admins<input className={input} type="number" min={1} {...num("maxAdmins")} /></label>
        <label className="text-xs font-semibold text-slate-600">Price / month ($)<input className={input} type="number" min={0} {...num("priceMonthly")} /></label>
        <label className="text-xs font-semibold text-slate-600">Commission (%)<input className={input} type="number" min={0} max={100} {...num("commissionPercent")} /></label>
        <div className="text-xs font-semibold text-slate-600">
          Allowed Features
          <div className="mt-2 space-y-1.5">
            {FEATURE_LABELS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm font-normal text-slate-700">
                <input type="checkbox" className="rounded border-slate-300 text-indigo-600" checked={form.allowedFeatures[k]} onChange={(e) => setForm({ ...form, allowedFeatures: { ...form.allowedFeatures, [k]: e.target.checked } })} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="col-span-full flex items-center gap-3 pt-2">
          <button className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
            {editing ? "Save Changes" : "Create Plan"}
          </button>
          {editing && (
            <button type="button" className="text-sm font-medium text-slate-500 hover:underline" onClick={() => { setEditing(null); setForm(empty); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">Plan</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Admins</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Features</th><th className="px-4 py-3">Tenants</th><th className="px-6 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((p) => (
              <tr key={p._id} className="hover:bg-slate-50/70">
                <td className="px-6 py-3.5 font-semibold text-slate-900">{p.name}</td>
                <td className="px-4 py-3.5 text-slate-600">{p.maxProducts}</td>
                <td className="px-4 py-3.5 text-slate-600">{p.maxAdmins}</td>
                <td className="px-4 py-3.5 font-medium text-slate-900">${p.priceMonthly}</td>
                <td className="px-4 py-3.5 text-slate-600">{p.commissionPercent}%</td>
                <td className="px-4 py-3.5 text-xs text-slate-600">{FEATURE_LABELS.filter(([k]) => p.allowedFeatures[k]).map(([, l]) => l).join(", ") || "—"}</td>
                <td className="px-4 py-3.5 text-slate-600">{p.tenantCount}</td>
                <td className="space-x-3 px-6 py-3.5 text-right whitespace-nowrap">
                  <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => { setEditing(p._id); setForm({ name: p.name, maxProducts: p.maxProducts, maxAdmins: p.maxAdmins, priceMonthly: p.priceMonthly, commissionPercent: p.commissionPercent, allowedFeatures: { ...p.allowedFeatures } }); }}>Edit</button>
                  <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
