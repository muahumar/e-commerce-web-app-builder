"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, type Category } from "@/lib/admin";
import { Messages, inputCls, useAction, useAdminData } from "@/lib/useAdminData";

export default function CategoriesPage() {
  const { store } = useParams<{ store: string }>();
  const { data, error: loadErr, reload } = useAdminData<{ items: Category[] }>(store, "/categories");
  const { run, error, notice } = useAction(reload);
  const [name, setName] = useState("");
  const items = data?.items ?? [];

  const move = (i: number, dir: -1 | 1) => {
    const ids = items.map((c) => c._id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => adminFetch(store, "/categories/reorder", { method: "PUT", json: { ids } }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Categories</h1>
        <p className="mt-1 text-sm text-slate-500">The order here controls how categories appear on your storefront.</p>
      </div>
      <Messages error={error || loadErr} notice={notice} />
      <form className="flex max-w-md gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={async (e) => { e.preventDefault(); if (await run(() => adminFetch(store, "/categories", { method: "POST", json: { name } }))) setName(""); }}>
        <input className={`${inputCls} flex-1`} placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Add</button>
      </form>
      <div className="max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {items.map((c, i) => (
            <li key={c._id} className="flex items-center justify-between p-4 text-sm">
              <span className="font-medium text-slate-900">{c.name} <span className="ml-1 text-xs text-slate-400">({c.productCount})</span></span>
              <span className="space-x-3">
                <button disabled={i === 0} className="text-slate-600 hover:text-slate-900 disabled:opacity-30" onClick={() => move(i, -1)}>↑</button>
                <button disabled={i === items.length - 1} className="text-slate-600 hover:text-slate-900 disabled:opacity-30" onClick={() => move(i, 1)}>↓</button>
                <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => { const n = window.prompt("Rename category", c.name); if (n) run(() => adminFetch(store, `/categories/${c._id}`, { method: "PATCH", json: { name: n } })); }}>Rename</button>
                <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => window.confirm(`Delete ${c.name}? Its products become uncategorised.`) && run(() => adminFetch(store, `/categories/${c._id}`, { method: "DELETE" }))}>Delete</button>
              </span>
            </li>
          ))}
          {data && !items.length && <li className="p-6 text-center text-sm text-slate-500">No categories yet.</li>}
        </ul>
      </div>
    </div>
  );
}
