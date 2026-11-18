"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { saToken } from "@/lib/sa";

const links: [string, string, string][] = [
  ["/superadmin/dashboard", "Dashboard", "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6"],
  ["/superadmin/tenants", "Tenants", "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"],
  ["/superadmin/plans", "Plans", "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"],
  ["/superadmin/themes", "Themes", "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"],
  ["/superadmin/audit", "Audit Log", "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"],
];

const noop = () => () => {};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authed = useSyncExternalStore(noop, () => !!saToken.get(), () => null);

  if (authed === null) return null;
  if (!authed) {
    router.replace("/superadmin/login");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#FAF6F0]">
      <aside className="flex w-64 shrink-0 flex-col justify-between bg-[#450A0A] p-5 text-[#F3EAD8]">
        <div>
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FAF6F0] text-sm font-bold text-red-900">
              SF
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#FAF6F0]">ShopForge</h2>
              <p className="text-[11px] text-red-200/80">Super Admin</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {links.map(([href, label, icon]) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-red-700 text-[#FAF6F0] shadow-sm" : "text-[#F3EAD8]/80 hover:bg-red-900/60 hover:text-[#FAF6F0]"
                  }`}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-red-900 pt-4">
          <button
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-200/80 transition hover:bg-red-900/60 hover:text-[#FAF6F0]"
            onClick={() => {
              saToken.clear();
              router.push("/superadmin/login");
            }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
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
