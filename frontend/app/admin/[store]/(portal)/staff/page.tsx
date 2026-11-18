"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, type Person } from "@/lib/admin";
import { Messages, inputCls, useAction, useAdminData } from "@/lib/useAdminData";

export default function StaffPage() {
  const { store } = useParams<{ store: string }>();
  const { data, error: loadErr, reload } = useAdminData<{ items: Person[] }>(store, "/staff");
  const { run, error, notice } = useAction(reload);
  const [form, setForm] = useState({ name: "", email: "", role: "cashier" });
  const [msg, setMsg] = useState("");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const ok = await run(async () => {
      const r = await adminFetch<{ devOnly?: { tempPassword: string } }>(store, "/staff", { method: "POST", json: form });
      setMsg(`Invitation emailed to ${form.email}.${r.devOnly ? ` (temp password: ${r.devOnly.tempPassword})` : ""}`);
    });
    if (ok) setForm({ name: "", email: "", role: "cashier" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff</h1>
        <p className="mt-1 text-sm text-slate-500">Cashiers get POS access only. Sub-admins have full store access (limited by your plan).</p>
      </div>
      <Messages error={error || loadErr} notice={notice || msg} />
      <form onSubmit={invite} className="flex max-w-3xl flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <input className={inputCls} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className={inputCls} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="cashier">Cashier</option><option value="clientadmin">Sub-admin</option>
        </select>
        <button className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Invite Staff</button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-6 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/70">
                <td className="px-6 py-3.5"><div className="font-semibold text-slate-900">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                <td className="px-4 py-3.5 text-slate-700">{u.role === "clientadmin" ? "Admin" : "Cashier"}</td>
                <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{u.status}</span></td>
                <td className="px-6 py-3.5 text-right">
                  {u.status === "active" ? (
                    <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => window.confirm(`Remove ${u.name}'s access?`) && run(() => adminFetch(store, `/staff/${u.id}/status`, { method: "PATCH", json: { status: "removed" } }))}>Remove access</button>
                  ) : (
                    <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => run(() => adminFetch(store, `/staff/${u.id}/status`, { method: "PATCH", json: { status: "active" } }))}>Restore</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
