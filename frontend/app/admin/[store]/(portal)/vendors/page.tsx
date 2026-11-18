"use client";

import { useParams } from "next/navigation";
import { adminFetch, type Person } from "@/lib/admin";
import { Messages, useAction, useAdminData } from "@/lib/useAdminData";

export default function VendorsPage() {
  const { store } = useParams<{ store: string }>();
  const { data, error: loadErr, reload } = useAdminData<{ items: Person[]; multiVendorEnabled: boolean }>(store, "/vendors");
  const { run, error } = useAction(reload);
  const set = (id: string, status: string) => run(() => adminFetch(store, `/vendors/${id}/status`, { method: "PATCH", json: { status } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vendors</h1>
        <p className="mt-1 text-sm text-slate-500">Approve sub-sellers to list products on your marketplace.</p>
      </div>
      {data && !data.multiVendorEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Multi-vendor mode is off. Enable it in Settings (if your plan includes it) to accept vendor sign-ups.
        </div>
      )}
      <Messages error={error || loadErr} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">Vendor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Products</th><th className="px-6 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50/70">
                <td className="px-6 py-3.5"><div className="font-semibold text-slate-900">{v.name}</div><div className="text-xs text-slate-500">{v.email}</div></td>
                <td className="px-4 py-3.5"><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">{v.status}</span></td>
                <td className="px-4 py-3.5 text-slate-600">{v.productCount}</td>
                <td className="space-x-3 px-6 py-3.5 text-right whitespace-nowrap">
                  {(v.status === "pending" || v.status === "rejected" || v.status === "removed") && <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => set(v.id, "active")}>Approve</button>}
                  {v.status === "pending" && <button className="text-xs font-medium text-amber-700 hover:underline" onClick={() => set(v.id, "rejected")}>Reject</button>}
                  {v.status === "active" && <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => window.confirm(`Remove ${v.name}'s access? Their products will be hidden.`) && set(v.id, "removed")}>Remove access</button>}
                </td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No vendors yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
