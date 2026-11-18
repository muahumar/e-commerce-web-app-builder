import Link from "next/link";
import { sfServerFetch, type SfCategory, type StoreInfo } from "@/lib/storefront";

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ store: string }>;
}) {
  const { store } = await params;
  const data = await sfServerFetch<{ store: StoreInfo; categories: SfCategory[] }>(store, "/storefront");

  if (!data) {
    return (
      <main className="mx-auto mt-24 max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Store Unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">This store does not exist or is currently suspended.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
          Back to platform
        </Link>
      </main>
    );
  }

  const s = data.store;
  const title = s.settings.storeName || s.businessName;
  const palette = s.theme?.colorPalettes?.find((p) => p.name === s.settings.colorPalette);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF6F0]">
      <header
        className="sticky top-0 z-20 border-b border-[#E4D6C1] bg-[#FFFDF9]/90 backdrop-blur"
        style={palette ? { backgroundColor: palette.secondary, borderColor: palette.primary } : undefined}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href={`/${store}`} className="flex items-center gap-3">
            {s.settings.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.settings.logo} alt={title} className="h-9 w-9 rounded-xl border border-[#E4D6C1] object-cover" />
            )}
            <span className="text-xl font-bold tracking-tight text-red-900" style={palette ? { color: palette.primary } : undefined}>
              {title}
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-700">
            <Link href={`/${store}`} className="rounded-lg px-3 py-1.5 hover:bg-[#F3EAD8] hover:text-red-900">Shop</Link>
            <Link href={`/${store}/cart`} className="rounded-lg px-3 py-1.5 hover:bg-[#F3EAD8] hover:text-red-900">Cart</Link>
            <Link href={`/${store}/orders`} className="rounded-lg px-3 py-1.5 hover:bg-[#F3EAD8] hover:text-red-900">Orders</Link>
            <Link href={`/${store}/account`} className="rounded-lg px-3 py-1.5 hover:bg-[#F3EAD8] hover:text-red-900">Account</Link>
            {s.features.multiVendor && (
              <Link href={`/${store}/vendor`} className="ml-1 rounded-xl border border-red-800/30 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100">
                Vendor Portal
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-[#E4D6C1] bg-[#F3EAD8] px-6 py-8 text-center text-xs text-stone-600">
        <p className="text-sm font-semibold text-red-900">{title}</p>
        <p className="mt-1">
          {[s.settings.contactEmail, s.settings.contactPhone, s.settings.contactAddress].filter(Boolean).join(" · ") || "Powered by ShopForge"}
        </p>
      </footer>
    </div>
  );
}
