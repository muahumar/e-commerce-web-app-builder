"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch, uploadImage, type Category, type Product } from "@/lib/admin";
import { Messages, inputCls, money, useAction, useAdminData } from "@/lib/useAdminData";

type Form = { name: string; price: string; stock: string; categoryId: string; description: string; images: string[]; variants: string; published: boolean };
const empty: Form = { name: "", price: "", stock: "0", categoryId: "", description: "", images: [], variants: "", published: true };

const parseVariants = (s: string) =>
  s.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [name, opts = ""] = p.split(":");
    return { name: name.trim(), options: opts.split(",").map((o) => o.trim()).filter(Boolean) };
  });
const showVariants = (v: Product["variants"]) => v.map((x) => `${x.name}:${x.options.join(",")}`).join("; ");

export default function ProductsPage() {
  const { store } = useParams<{ store: string }>();
  const [q, setQ] = useState("");
  const { data, error: loadErr, reload } = useAdminData<{ items: Product[]; total: number }>(store, `/products?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const cats = useAdminData<{ items: Category[] }>(store, "/categories");
  const { run, error, notice } = useAction(reload);
  const [form, setForm] = useState<Form>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const catName = (id?: string) => cats.data?.items.find((c) => c._id === id)?.name ?? "—";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      price: Number(form.price),
      stock: Number(form.stock),
      categoryId: form.categoryId || null,
      description: form.description,
      images: form.images,
      variants: parseVariants(form.variants),
      published: form.published,
    };
    const ok = await run(() => adminFetch(store, editing ? `/products/${editing}` : "/products", { method: editing ? "PATCH" : "POST", json: body }), editing ? "Product updated" : "Product created");
    if (ok) {
      setForm(empty);
      setEditing(null);
      setOpen(false);
    }
  }

  function edit(p: Product) {
    setEditing(p._id);
    setOpen(true);
    setForm({ name: p.name, price: String(p.price), stock: String(p.stock), categoryId: p.categoryId ?? "", description: p.description ?? "", images: p.images, variants: showVariants(p.variants), published: p.published });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products</h1>
          <p className="mt-1 text-sm text-slate-500">Create, edit, and organize your store catalog.</p>
        </div>
        <button className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700" onClick={() => { setOpen(!open); setEditing(null); setForm(empty); }}>
          {open ? "Cancel" : "+ Add Product"}
        </button>
      </div>
      <Messages error={error || loadErr} notice={notice} />

      {open && (
        <form onSubmit={save} className="grid max-w-3xl grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <input className={inputCls} placeholder="Product name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">No category</option>
            {cats.data?.items.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <input className={inputCls} type="number" step="0.01" min="0" placeholder="Price ($)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <input className={inputCls} type="number" min="0" placeholder="Stock quantity" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          <textarea className={`${inputCls} sm:col-span-2`} rows={3} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Variants, e.g. Size:S,M,L; Color:Red,Blue" value={form.variants} onChange={(e) => setForm({ ...form, variants: e.target.value })} />
          <div className="sm:col-span-2 text-sm">
            <label className="block text-xs font-semibold text-slate-600">Product Images</label>
            <input className="mt-1.5 text-xs text-slate-600" type="file" accept="image/*" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              await run(async () => { const url = await uploadImage(store, f); setForm((s) => ({ ...s, images: [...s.images, url] })); });
              e.target.value = "";
            }} />
            <div className="mt-3 flex flex-wrap gap-2">
              {form.images.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <div key={u} className="relative"><img src={u} alt="" className="h-16 w-16 rounded-xl border border-slate-200 object-cover" />
                  <button type="button" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white" onClick={() => setForm({ ...form, images: form.images.filter((x) => x !== u) })}>×</button></div>
              ))}
            </div>
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Published on storefront</label>
          <button className="sm:col-span-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">{editing ? "Save Changes" : "Create Product"}</button>
        </form>
      )}

      <input className={`${inputCls} w-full max-w-xs`} placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((p) => (
              <tr key={p._id} className="hover:bg-slate-50/70">
                <td className="flex items-center gap-3 px-6 py-3 font-medium text-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.images[0] ? <img src={p.images[0]} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-cover" /> : <div className="h-10 w-10 rounded-lg bg-slate-100" />}
                  {p.name}
                </td>
                <td className="px-4 py-3 text-slate-600">{catName(p.categoryId)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{money(p.price)}</td>
                <td className={`px-4 py-3 ${p.stock <= 5 ? "font-semibold text-rose-600" : "text-slate-600"}`}>{p.stock}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${p.published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.published ? "Live" : "Hidden"}
                  </span>
                </td>
                <td className="space-x-3 px-6 py-3 text-right whitespace-nowrap">
                  <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => edit(p)}>Edit</button>
                  <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => window.confirm(`Delete ${p.name}?`) && run(() => adminFetch(store, `/products/${p._id}`, { method: "DELETE" }))}>Delete</button>
                </td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
