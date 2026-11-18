"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/sa";

type Log = { _id: string; action: string; actorRole: string; tenantId: string; createdAt: string; meta?: Record<string, unknown> | string[] };

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    saFetch<{ items: Log[] }>("/audit-logs?limit=100").then((r) => setLogs(r.items)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">Security trail of tenant provisioning, status changes, and impersonation sessions.</p>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">When</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Tenant ID</th><th className="px-6 py-3">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l._id} className="align-top hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-6 py-3 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800">{l.action}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.tenantId}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{l.meta ? JSON.stringify(l.meta) : "—"}</td>
              </tr>
            ))}
            {!logs.length && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No audit entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
