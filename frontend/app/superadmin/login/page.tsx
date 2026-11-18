"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saFetch, saToken } from "@/lib/sa";

export default function SuperAdminLogin() {
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
      const r = await saFetch<{ token: string }>("/auth/login", { method: "POST", json: { email, password } });
      saToken.set(r.token);
      router.push("/superadmin/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#450A0A] via-[#7F1D1D] to-[#291D18] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E4D6C1] bg-[#FAF6F0] p-8 shadow-2xl">
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
            Platform Control Panel
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-stone-900">Super Admin Sign In</h1>
          <p className="mt-1 text-sm text-stone-600">Manage tenants, subscription plans, themes, and platform analytics.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">Email</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#D8C5AA] bg-[#FFFDF9] px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20"
              type="email"
              placeholder="superadmin@platform.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">Password</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#D8C5AA] bg-[#FFFDF9] px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20"
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

        <div className="mt-6 border-t border-[#E4D6C1] pt-4 text-center">
          <Link href="/" className="text-xs font-medium text-stone-600 hover:text-red-900">
            ← Back to platform home
          </Link>
        </div>
      </div>
    </main>
  );
}
