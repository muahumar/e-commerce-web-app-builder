"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { money, sfFetch, vendorToken, type SfProduct } from "@/lib/storefront";

type VendorOrder = { _id: string; status: string; createdAt: string; vendorSubtotal: number; items: { name: string; price: number; quantity: number }[] };
const noop = () => () => {};

export default function VendorPortalPage() {
  const { store } = useParams<{ store: string }>();
  const hasTok = useSyncExternalStore(noop, () => !!vendorToken.get(store), () => null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const authed = loggedIn ?? hasTok === true;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<SfProduct[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [form, setForm] = useState({ name: "", price: "", stock: "10", description: "" });
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);

  const reload = useCallback(() => setN((x) => x + 1), []);

  useEffect(() => {
    if (!authed) return;
    Promise.all([
      sfFetch<{ items: SfProduct[] }>(store, "/vendor/products", { useVendor: true }),
      sfFetch<{ items: VendorOrder[] }>(store, "/vendor/orders", { useVendor: true }),
    ])
      .then(([p, o]) => {
        setProducts(p.items);
        setOrders(o.items);
      })
      .catch((e) => setErr(e.message));
  }, [store, n, authed]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await sfFetch<{ token: string; user: { role: string } }>(store, "/auth/login", { method: "POST", json: { email, password } });
      if (r.user.role !== "vendor") throw new Error("Vendor account required");
      vendorToken.set(store, r.token);
      setLoggedIn(true);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await sfFetch(store, "/vendor/products", {
        method: "POST",
        useVendor: true,
        json: { name: form.name, price: Number(form.price), stock: Number(form.stock), description: form.description },
      });
      setForm({ name: "", price: "", stock: "10", description: "" });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border p-6">
        <h1 className="text-xl font-bold">Vendor Sign In</h1>
        <form onSubmit={login} className="mt-4 space-y-3">
          <input className="w-full rounded border p-2 text-sm" type="email" placeholder="Vendor email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded border p-2 text-sm" type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button className="w-full rounded bg-black py-2 text-sm text-white">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vendor Portal</h1>
        <button className="text-sm underline" onClick={() => { vendorToken.clear(store); setLoggedIn(false); }}>Sign out</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <form onSubmit={addProduct} className="grid max-w-2xl grid-cols-3 gap-3 rounded-lg border p-4">
        <input className="rounded border p-2 text-sm" placeholder="Product name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded border p-2 text-sm" type="number" step="0.01" min="0" placeholder="Price" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <input className="rounded border p-2 text-sm" type="number" min="0" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <input className="col-span-2 rounded border p-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="rounded bg-black text-sm text-white">Add listing</button>
      </form>

      <div>
        <h2 className="font-semibold">My Products ({products.length})</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="border-b text-gray-500"><tr><th className="py-2">Name</th><th>Price</th><th>Stock</th><th /></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id} className="border-b">
                <td className="py-2">{p.name}</td><td>{money(p.price)}</td><td>{p.stock}</td>
                <td>
                  <button className="text-red-700 underline" onClick={() => sfFetch(store, `/vendor/products/${p._id}`, { method: "DELETE", useVendor: true }).then(reload)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="font-semibold">My Split Orders ({orders.length})</h2>
        <div className="mt-2 space-y-3">
          {orders.map((o) => (
            <div key={o._id} className="rounded border p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>Order #{o._id.slice(-8)} · {o.status}</span>
                <span>Your share: {money(o.vendorSubtotal)}</span>
              </div>
              <ul className="mt-1 text-xs text-gray-600">
                {o.items.map((i, idx) => <li key={idx}>{i.quantity}× {i.name} ({money(i.price)})</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
