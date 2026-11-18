"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, type Review } from "@/lib/admin";
import { Messages, inputCls, useAction, useAdminData } from "@/lib/useAdminData";

export default function ReviewsPage() {
  const { store } = useParams<{ store: string }>();
  const [filter, setFilter] = useState("");
  const { data, error: loadErr, reload } = useAdminData<{ items: Review[] }>(store, `/reviews${filter ? `?approved=${filter}` : ""}`);
  const { run, error } = useAction(reload);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Review Moderation</h1>
          <p className="mt-1 text-sm text-slate-500">Approve or hide verified customer reviews before they appear on your storefront.</p>
        </div>
        <select className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All reviews</option><option value="false">Pending / hidden</option><option value="true">Approved</option>
        </select>
      </div>
      <Messages error={error || loadErr} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {data?.items.map((r) => (
            <li key={r._id} className="flex items-start justify-between gap-4 p-5 text-sm">
              <div>
                <div className="font-semibold text-slate-900">{r.productName} <span className="ml-2 text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></div>
                <div className="mt-1 text-slate-700">{r.comment || <em className="text-slate-400">No comment</em>}</div>
                <div className="mt-1 text-xs text-slate-500">by {r.customerName}</div>
              </div>
              <button className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${r.approved ? "bg-slate-600 hover:bg-slate-700" : "bg-emerald-600 hover:bg-emerald-700"}`} onClick={() => run(() => adminFetch(store, `/reviews/${r._id}`, { method: "PATCH", json: { approved: !r.approved } }))}>
                {r.approved ? "Hide" : "Approve"}
              </button>
            </li>
          ))}
          {data && !data.items.length && <li className="p-8 text-center text-sm text-slate-500">No reviews found.</li>}
        </ul>
      </div>
    </div>
  );
}
