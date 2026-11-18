"use client";

import Link from "next/link";
import { useState } from "react";

export function StoreQuickLaunch() {
  const [slug, setSlug] = useState("demo");
  const clean = slug.trim().toLowerCase() || "demo";

  return (
    <div className="mt-8 grid gap-6 md:grid-cols-3">
      {/* Super Admin Card */}
      <div className="flex flex-col justify-between rounded-2xl border border-[#E4D6C1] bg-[#FFFDF9] p-6 shadow-sm transition hover:shadow-md">
        <div>
          <span className="inline-flex items-center rounded-full bg-red-900 px-3 py-1 text-xs font-medium text-[#FAF6F0]">
            Platform Owner
          </span>
          <h2 className="mt-4 text-xl font-bold text-stone-900">Super Admin Portal</h2>
          <p className="mt-2 text-sm text-stone-600">
            Provision new client stores, configure subscription plans, manage themes, and monitor platform revenue.
          </p>
        </div>
        <Link
          href="/superadmin/login"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-red-800 px-4 py-2.5 text-sm font-semibold text-[#FAF6F0] transition hover:bg-red-900"
        >
          Open Super Admin →
        </Link>
      </div>

      {/* Store slug selector shared by Client Admin & Storefront */}
      <div className="flex flex-col justify-between rounded-2xl border border-[#E4D6C1] bg-[#FFFDF9] p-6 shadow-sm transition hover:shadow-md">
        <div>
          <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200">
            Store Manager
          </span>
          <h2 className="mt-4 text-xl font-bold text-stone-900">Client Admin Portal</h2>
          <p className="mt-2 text-sm text-stone-600">
            Manage products, categories, orders, coupons, staff, vendors, and store branding for a tenant.
          </p>
          <label className="mt-4 block text-xs font-medium text-stone-600">
            Store slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. acme"
              className="mt-1 w-full rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3 py-2 text-sm text-stone-900 focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20"
            />
          </label>
        </div>
        <Link
          href={`/admin/${clean}/login`}
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-[#FAF6F0] transition hover:bg-red-800"
        >
          Manage /{clean} →
        </Link>
      </div>

      {/* Public Storefront Card */}
      <div className="flex flex-col justify-between rounded-2xl border border-[#E4D6C1] bg-[#FFFDF9] p-6 shadow-sm transition hover:shadow-md">
        <div>
          <span className="inline-flex items-center rounded-full bg-[#F3EAD8] px-3 py-1 text-xs font-medium text-stone-800">
            Customer Facing
          </span>
          <h2 className="mt-4 text-xl font-bold text-stone-900">Public Storefront</h2>
          <p className="mt-2 text-sm text-stone-600">
            Browse the server-rendered catalog, filter products, add to cart, apply coupons, and checkout.
          </p>
          <div className="mt-4 rounded-xl bg-[#F3EAD8] px-3 py-2 font-mono text-xs text-stone-700">
            localhost:3000/{clean}
          </div>
        </div>
        <Link
          href={`/${clean}`}
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-red-800 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-900 transition hover:bg-red-100"
        >
          Visit Storefront →
        </Link>
      </div>
    </div>
  );
}
