"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { adminToken } from "@/lib/admin";

const NAV: [string, string][] = [
  ["dashboard", "Dashboard"],
  ["products", "Products"],
  ["categories", "Categories"],
  ["orders", "Orders"],
  ["coupons", "Coupons"],
  ["reviews", "Reviews"],
  ["vendors", "Vendors"],
  ["staff", "Staff"],
  ["reports", "Reports"],
  ["settings", "Settings"],
];

const noop = () => () => {};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { store } = useParams<{ store: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const authed = useSyncExternalStore(noop, () => !!adminToken.get(store), () => null);

  if (authed === null) return null;
  if (!authed) {
    router.replace(`/admin/${store}/login`);
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#FAF6F0]">
      <aside className="flex w-64 shrink-0 flex-col justify-between border-r border-[#E4D6C1] bg-[#F3EAD8] p-5">
        <div>
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-800 text-sm font-bold uppercase text-[#FAF6F0]">
              {store.slice(0, 2)}
            </div>
            <div>
              <h2 className="text-sm font-bold capitalize text-stone-900">{store}</h2>
              <p className="text-[11px] text-stone-600">Store Admin</p>
            </div>
          </div>

          <nav className="mt-7 space-y-1">
            {NAV.map(([slug, label]) => {
              const href = `/admin/${store}/${slug}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={slug}
                  href={href}
                  className={`block rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                    active ? "bg-red-800 text-[#FAF6F0] shadow-sm" : "text-stone-700 hover:bg-[#E7D8C0] hover:text-stone-900"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-[#DECDB3] pt-4">
          <Link
            href={`/${store}`}
            target="_blank"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3 py-2 text-xs font-semibold text-red-900 transition hover:bg-red-50"
          >
            View Storefront ↗
          </Link>
          <button
            className="w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-stone-600 transition hover:bg-[#E7D8C0] hover:text-stone-900"
            onClick={() => {
              adminToken.clear(store);
              router.push(`/admin/${store}/login`);
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
