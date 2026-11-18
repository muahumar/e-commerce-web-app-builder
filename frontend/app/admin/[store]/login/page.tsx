"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { API_URL, adminToken } from "@/lib/admin";

export default function ClientAdminLogin() {
  const { store } = useParams<{ store: string }>();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/store/${store}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      if (data.user.role !== "clientadmin") throw new Error("This portal is for store admins only");
      adminToken.set(store, data.token);
      router.push(`/admin/${store}/dashboard`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#7F1D1D] via-[#450A0A] to-[#291D18] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E4D6C1] bg-[#FAF6F0] p-8 shadow-2xl">
        <div className="mb-6">
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 font-mono text-xs font-semibold text-red-900">
            /{store}
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-stone-900">Store Admin Sign In</h1>
          <p className="mt-1 text-sm text-stone-600">Manage products, orders, coupons, and storefront settings.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">Email</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#D8C5AA] bg-[#FFFDF9] px-3.5 py-2.5 text-sm text-stone-900 focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20"
              type="email"
              placeholder="admin@store.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">Password</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#D8C5AA] bg-[#FFFDF9] px-3.5 py-2.5 text-sm text-stone-900 focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-100 px-3.5 py-2.5 text-sm text-red-900">
              {error}
            </div>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl bg-red-800 py-2.5 text-sm font-semibold text-[#FAF6F0] shadow-sm transition hover:bg-red-900 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-[#E4D6C1] pt-4 text-xs text-stone-600">
          <Link href={`/${store}`} className="hover:text-red-900">View storefront →</Link>
          <Link href="/" className="hover:text-red-900">Platform home</Link>
        </div>
      </div>
    </main>
  );
}
