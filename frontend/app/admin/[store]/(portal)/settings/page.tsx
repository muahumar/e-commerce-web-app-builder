"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, uploadImage } from "@/lib/admin";
import { Messages, inputCls, useAction, useAdminData } from "@/lib/useAdminData";

type Settings = { storeName?: string; logo?: string; banner?: string; colorPalette?: string; contactPhone?: string; contactEmail?: string; contactAddress?: string };
type SettingsRes = { businessName: string; settings: Settings; theme: { name: string; colorPalettes: { name: string; primary: string; secondary: string }[] } | null };
type FeaturesRes = { features: Record<string, boolean>; allowed: Record<string, boolean> };

const FEATURE_LABELS: Record<string, string> = {
  discountBadge: "Discount badges on products",
  multiVendor: "Multi-vendor marketplace",
  reviews: "Customer reviews",
};

export default function SettingsPage() {
  const { store } = useParams<{ store: string }>();
  const s = useAdminData<SettingsRes>(store, "/settings");
  const f = useAdminData<FeaturesRes>(store, "/features");
  const { run, error, notice } = useAction(() => { s.reload(); f.reload(); });
  const [form, setForm] = useState<Settings>({});

  useEffect(() => {
    if (s.data) setForm(s.data.settings);
  }, [s.data]);

  const field = (k: keyof Settings, placeholder: string) => (
    <input className={`${inputCls} w-full`} placeholder={placeholder} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );
  const img = (k: "logo" | "banner") => (
    <div className="text-sm">
      <input className="text-xs text-slate-600" type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await run(async () => { const url = await uploadImage(store, file); setForm((v) => ({ ...v, [k]: url })); }); }} />
      {form[k] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form[k]} alt={k} className="mt-2 h-16 rounded-xl border border-slate-200 object-cover" />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Customize storefront branding, theme palette, and feature toggles.</p>
      </div>
      <Messages error={error || s.error || f.error} notice={notice} />

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(e) => { e.preventDefault(); run(() => adminFetch(store, "/settings", { method: "PATCH", json: form }), "Settings saved"); }}>
          <h2 className="text-base font-semibold text-slate-900">Branding &amp; Contact</h2>
          {field("storeName", "Store name")}
          <div><div className="mb-1 text-xs font-semibold text-slate-500">Logo</div>{img("logo")}</div>
          <div><div className="mb-1 text-xs font-semibold text-slate-500">Banner</div>{img("banner")}</div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">Colour palette{s.data?.theme ? ` (theme: ${s.data.theme.name})` : ""}</div>
            <select className={`${inputCls} w-full`} value={form.colorPalette ?? ""} onChange={(e) => setForm({ ...form, colorPalette: e.target.value })}>
              <option value="">Default</option>
              {s.data?.theme?.colorPalettes.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          {field("contactEmail", "Contact email")}
          {field("contactPhone", "Contact phone")}
          {field("contactAddress", "Address")}
          <button className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">Save Settings</button>
        </form>

        <div className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Feature Toggles</h2>
          <p className="mt-1 text-xs text-slate-500">Enable or disable features included in your subscription plan.</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {f.data && Object.keys(FEATURE_LABELS).map((k) => (
              <li key={k} className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium text-slate-800">
                  {FEATURE_LABELS[k]}
                  {!f.data!.allowed[k] && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">not in plan</span>}
                </span>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" disabled={!f.data!.allowed[k]} checked={!!f.data!.features[k]} onChange={(e) => run(() => adminFetch(store, "/features", { method: "PATCH", json: { features: { [k]: e.target.checked } } }))} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
