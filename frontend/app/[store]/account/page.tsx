"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { customerToken, sfFetch, type StoreInfo } from "@/lib/storefront";

export default function AccountPage() {
  const { store } = useParams<{ store: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<"customer" | "vendor">("customer");
  const [multiVendor, setMultiVendor] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    sfFetch<{ store: StoreInfo }>(store, "/storefront")
      .then((d) => setMultiVendor(!!d.store.features.multiVendor))
      .catch(() => {});
    if (customerToken.get(store)) {
      sfFetch<{ user: { name: string; email: string; role: string } }>(store, "/auth/me")
        .then((r) => setUser(r.user))
        .catch(() => customerToken.clear(store));
    }
  }, [store]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      if (mode === "login") {
        const r = await sfFetch<{ token: string; user: { name: string; email: string; role: string } }>(store, "/auth/login", {
          method: "POST",
          json: { email: form.email, password: form.password },
        });
        customerToken.set(store, r.token);
        setUser(r.user);
        router.push(`/${store}`);
      } else {
        const r = await sfFetch<{ token?: string; message?: string; user: { name: string; email: string; role: string } }>(store, "/auth/register", {
          method: "POST",
          json: { ...form, role },
        });
        if (r.token) {
          customerToken.set(store, r.token);
          setUser(r.user);
          router.push(`/${store}`);
        } else {
          setMsg(r.message || "Registered! Awaiting store admin approval.");
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (user) {
    return (
      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold capitalize text-indigo-700">{user.role}</span>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{user.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        <div className="mt-6 flex gap-3">
          <Link href={`/${store}/orders`} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">My Orders</Link>
          <button
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              customerToken.clear(store);
              setUser(null);
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

  return (
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        <button className={`flex-1 rounded-lg py-2 transition ${mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("login")}>
          Sign In
        </button>
        <button className={`flex-1 rounded-lg py-2 transition ${mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("register")}>
          Create Account
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "register" && (
          <>
            <input className={input} placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {multiVendor && (
              <select className={input} value={role} onChange={(e) => setRole(e.target.value as "customer" | "vendor")}>
                <option value="customer">Customer</option>
                <option value="vendor">Seller / Vendor (requires approval)</option>
              </select>
            )}
          </>
        )}
        <input className={input} type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={input} type="password" placeholder="Password (min 8 chars)" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-700">{err}</div>}
        {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-800">{msg}</div>}
        <button className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
          {mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}
