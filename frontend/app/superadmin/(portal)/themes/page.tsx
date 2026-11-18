"use client";

import { useCallback, useEffect, useState } from "react";
import { saFetch, type Theme } from "@/lib/sa";

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    saFetch<{ items: Theme[] }>("/themes").then((r) => setThemes(r.items)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Themes</h1>
        <p className="mt-1 text-sm text-slate-500">Templates available when provisioning new storefronts. Deactivate a theme to stop offering it.</p>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <form
        className="flex max-w-2xl flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await saFetch("/themes", { method: "POST", json: { name, description } });
            setName("");
            setDescription("");
          });
        }}
      >
        <input className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none" placeholder="Theme name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Add Theme</button>
      </form>

      <div className="max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {themes.map((t) => (
            <li key={t._id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{t.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.active ? "active" : "inactive"}
                  </span>
                </div>
                {t.description && <div className="mt-0.5 text-xs text-slate-500">{t.description}</div>}
              </div>
              <div className="space-x-3">
                <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => run(() => saFetch(`/themes/${t._id}`, { method: "PATCH", json: { active: !t.active } }))}>
                  {t.active ? "Deactivate" : "Activate"}
                </button>
                <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => window.confirm(`Delete ${t.name}?`) && run(() => saFetch(`/themes/${t._id}`, { method: "DELETE" }))}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {!themes.length && <li className="p-6 text-center text-sm text-slate-500">No themes yet.</li>}
        </ul>
      </div>
    </div>
  );
}
