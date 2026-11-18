"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch } from "@/lib/admin";

type Overview = {
  store: { businessName: string; status: string };
  counts: { products: number; lowStock: number; pendingOrders: number; pendingReviews: number; pendingVendors: number; cashiers: number };
  limits: { plan: string; maxProducts: number; products: number; maxAdmins: number; admins: number };
};

export default function Dashboard() {
  const { store } = useParams<{ store: string }>();
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<Overview>(store, "/overview").then(setD).catch((e) => setError(e.message));
  }, [store]);

  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!d) return <p className="text-sm text-slate-500">Loading store overview…</p>;

  const prodPct = d.limits.maxProducts ? Math.min(100, Math.round((d.limits.products / d.limits.maxProducts) * 100)) : 0;
  const adminPct = d.limits.maxAdmins ? Math.min(100, Math.round((d.limits.admins / d.limits.maxAdmins) * 100)) : 0;

  const cards: { label: string; value: string | number; href: string; accent: string }[] = [
    { label: "Total Products", value: d.counts.products, href: "products", accent: "border-l-red-800" },
    { label: "Low Stock (≤5)", value: d.counts.lowStock, href: "products", accent: "border-l-rose-600" },
    { label: "Pending Orders", value: d.counts.pendingOrders, href: "orders", accent: "border-l-amber-600" },
    { label: "Reviews to Moderate", value: d.counts.pendingReviews, href: "reviews", accent: "border-l-stone-600" },
    { label: "Pending Vendors", value: d.counts.pendingVendors, href: "vendors", accent: "border-l-red-700" },
    { label: "Active Cashiers", value: d.counts.cashiers, href: "staff", accent: "border-l-emerald-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{d.store.businessName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Subscription Plan: <span className="font-semibold text-indigo-600">{d.limits.plan}</span>
          </p>
        </div>
          <Link
          href={`/admin/${store}/products`}
          className="rounded-xl bg-red-800 px-4 py-2 text-sm font-semibold text-[#FAF6F0] shadow-sm transition hover:bg-red-900"
        >
          + Manage Products
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={`/admin/${store}/${c.href}`}
            className={`rounded-2xl border border-slate-200 border-l-4 ${c.accent} bg-white p-5 shadow-sm transition hover:shadow-md`}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{c.label}</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex justify-between text-sm font-medium text-slate-700">
            <span>Product Quota</span>
            <span>{d.limits.products} / {d.limits.maxProducts}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${prodPct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex justify-between text-sm font-medium text-slate-700">
            <span>Admin Seats</span>
            <span>{d.limits.admins} / {d.limits.maxAdmins}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${adminPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
