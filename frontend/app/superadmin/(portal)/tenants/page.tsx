"use client";

import { useCallback, useEffect, useState } from "react";
import { saFetch, type Plan, type Tenant, type Theme } from "@/lib/sa";

const statusColor: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  suspended: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  trial_expired: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ businessName: "", subdomain: "", contactEmail: "", adminPassword: "", plan: "", theme: "" });
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => setReload((n) => n + 1), []);

  useEffect(() => {
    const qs = new URLSearchParams({ ...(status && { status }), ...(q && { q }) }).toString();
    saFetch<{ items: Tenant[] }>(`/tenants?${qs}`)
      .then((r) => setTenants(r.items))
      .catch((e) => setError(e.message));
  }, [status, q, reload]);

  useEffect(() => {
    saFetch<{ items: Plan[] }>("/plans").then((r) => setPlans(r.items));
    saFetch<{ items: Theme[] }>("/themes").then((r) => setThemes(r.items.filter((t) => t.active)));
  }, []);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setError("");
    setNotice("");
    try {
      await fn();
      if (ok) setNotice(ok);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act(async () => {
      const r = await saFetch<{ loginUrl: string; devOnly?: { tempPassword: string } }>("/tenants", {
        method: "POST",
        json: {
          ...form,
          adminPassword: form.adminPassword || undefined,
          theme: form.theme || undefined,
        },
      });
      setNotice(`Tenant created! Login: ${r.loginUrl}${form.adminPassword ? " (using your chosen password)" : r.devOnly ? ` — Temp password: ${r.devOnly.tempPassword}` : ""}`);
      setForm({ businessName: "", subdomain: "", contactEmail: "", adminPassword: "", plan: "", theme: "" });
      setShowForm(false);
    });
  };

  const impersonate = (t: Tenant) => {
    const reason = window.prompt(`Reason for acting as ${t.businessName}'s admin? (logged)`);
    if (reason === null) return;
    act(async () => {
      const r = await saFetch<{ token: string }>(`/tenants/${t._id}/impersonate`, { method: "POST", json: { reason } });
      localStorage.setItem(`admin_token_${t.subdomain}`, r.token);
      window.open(`/admin/${t.subdomain}/dashboard`, "_blank");
    }, "Impersonation started (30 min, audited).");
  };

  const input = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tenants</h1>
          <p className="mt-1 text-sm text-slate-500">Provision, suspend, impersonate, or manage client storefronts.</p>
        </div>
        <button
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "+ Add Tenant"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="break-words rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {showForm && (
        <form onSubmit={create} className="grid max-w-3xl gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <h2 className="col-span-full text-base font-semibold text-slate-900">Provision New Storefront</h2>
          <input className={input} placeholder="Business name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
          <input className={input} placeholder="Subdomain slug (e.g. acme)" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} required />
          <input className={input} type="email" placeholder="Contact email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required />
          <input className={input} type="password" minLength={8} placeholder="Admin password (optional, min 8 chars)" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
          <select className={input} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} required>
            <option value="">Select plan…</option>
            {plans.map((p) => <option key={p._id} value={p._id}>{p.name} (${p.priceMonthly}/mo)</option>)}
          </select>
          <select className={input} value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
            <option value="">Default theme</option>
            {themes.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
            Create Tenant
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-3">
        <input className={`${input} min-w-[220px] flex-1 sm:max-w-xs`} placeholder="Search business, slug, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="trial_expired">Trial expired</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3">Store</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t._id} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3.5">
                    <div className="font-semibold text-slate-900">{t.businessName}</div>
                    <div className="text-xs text-slate-500"><span className="font-mono">/{t.subdomain}</span> · {t.contactEmail}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                      value={t.plan?._id ?? ""}
                      onChange={(e) => act(() => saFetch(`/tenants/${t._id}`, { method: "PATCH", json: { plan: e.target.value } }))}
                    >
                      {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor[t.status]}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="space-x-3 px-6 py-3.5 text-right whitespace-nowrap">
                    {t.status === "active" ? (
                      <button className="text-xs font-medium text-amber-700 hover:underline" onClick={() => act(() => saFetch(`/tenants/${t._id}/status`, { method: "PATCH", json: { status: "suspended" } }))}>
                        Suspend
                      </button>
                    ) : (
                      <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => act(() => saFetch(`/tenants/${t._id}/status`, { method: "PATCH", json: { status: "active" } }))}>
                        Activate
                      </button>
                    )}
                    <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => impersonate(t)}>
                      Impersonate
                    </button>
                    <button
                      className="text-xs font-medium text-rose-600 hover:underline"
                      onClick={() => window.confirm(`Delete ${t.businessName} and ALL its data? This cannot be undone.`) && act(() => saFetch(`/tenants/${t._id}`, { method: "DELETE" }))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!tenants.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No tenants found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
