import type { Metadata } from "next";
import Link from "next/link";
import { money, sfServerFetch, type SfCategory, type SfProduct, type StoreInfo } from "@/lib/storefront";
import { AddToCartButton } from "./AddToCartButton";

type SearchParams = Promise<{ q?: string; categoryId?: string; sort?: string; minPrice?: string; maxPrice?: string; page?: string }>;

export async function generateMetadata({ params }: { params: Promise<{ store: string }> }): Promise<Metadata> {
  const { store } = await params;
  const data = await sfServerFetch<{ store: StoreInfo }>(store, "/storefront");
  const name = data?.store.settings.storeName || data?.store.businessName || store;
  return { title: `${name} — Online Store`, description: `Browse products and shop at ${name}.` };
}

export default async function StorefrontHome({ params, searchParams }: { params: Promise<{ store: string }>; searchParams: SearchParams }) {
  const { store } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.q) qs.set("q", sp.q);
  if (sp.categoryId) qs.set("categoryId", sp.categoryId);
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.minPrice) qs.set("minPrice", sp.minPrice);
  if (sp.maxPrice) qs.set("maxPrice", sp.maxPrice);
  if (sp.page) qs.set("page", sp.page);

  const [sfData, prodData] = await Promise.all([
    sfServerFetch<{ store: StoreInfo; categories: SfCategory[] }>(store, "/storefront"),
    sfServerFetch<{ items: SfProduct[]; total: number; page: number; limit: number }>(store, `/products?${qs.toString()}`),
  ]);

  if (!sfData) return null;
  const { store: s, categories } = sfData;
  const products = prodData?.items ?? [];
  const title = s.settings.storeName || s.businessName;

  return (
    <div className="space-y-6">
      {s.settings.banner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.settings.banner} alt={title} className="h-56 w-full rounded-2xl border border-slate-200 object-cover shadow-sm" />
      ) : (
        <div className="rounded-2xl bg-gradient-to-r from-[#450A0A] via-[#7F1D1D] to-[#991B1B] p-8 text-[#FAF6F0] shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-[#F3EAD8]">Discover our curated collection. Fast checkout and verified reviews.</p>
        </div>
      )}

      {s.features.discountBadge && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
          Promo active: Apply your coupon code at checkout for an instant discount!
        </div>
      )}

      {/* Search, category & sort bar */}
      <form method="GET" action={`/${store}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E4D6C1] bg-[#FFFDF9] p-4 shadow-sm">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search products…" className="min-w-[180px] flex-1 rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3.5 py-2 text-sm focus:border-red-700 focus:outline-none" />
        <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3 py-2 text-sm">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
        <input name="minPrice" type="number" min="0" defaultValue={sp.minPrice ?? ""} placeholder="Min $" className="w-24 rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3 py-2 text-sm" />
        <input name="maxPrice" type="number" min="0" defaultValue={sp.maxPrice ?? ""} placeholder="Max $" className="w-24 rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3 py-2 text-sm" />
        <select name="sort" defaultValue={sp.sort ?? "newest"} className="rounded-xl border border-[#D8C5AA] bg-[#FAF6F0] px-3 py-2 text-sm">
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="rating">Top Rated</option>
        </select>
        <button className="rounded-xl bg-red-800 px-5 py-2 text-sm font-semibold text-[#FAF6F0] transition hover:bg-red-900">Filter</button>
        {(sp.q || sp.categoryId || sp.minPrice || sp.maxPrice || sp.sort) && (
          <Link href={`/${store}`} className="text-sm font-medium text-stone-600 hover:underline">Clear</Link>
        )}
      </form>

      {/* Product grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <div key={p._id} className="group flex flex-col justify-between rounded-2xl border border-[#E4D6C1] bg-[#FFFDF9] p-4 shadow-sm transition hover:shadow-md">
            <div>
              <Link href={`/${store}/products/${p._id}`} className="block overflow-hidden rounded-xl bg-[#F3EAD8]">
                {p.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0]} alt={p.name} className="h-48 w-full object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center text-xs text-stone-400">No image</div>
                )}
              </Link>
              <Link href={`/${store}/products/${p._id}`}>
                <h2 className="mt-3 font-semibold text-stone-900 group-hover:text-red-800">{p.name}</h2>
              </Link>
              {s.features.multiVendor && p.sellerName && (
                <p className="text-xs text-slate-500">Sold by {p.sellerName}</p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900">{money(p.price)}</span>
                {s.features.reviews !== false && p.ratingCount > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">★ {p.ratingAvg.toFixed(1)} ({p.ratingCount})</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}</p>
            </div>
            <div className="mt-4">
              <AddToCartButton store={store} productId={p._id} disabled={p.stock < 1} />
            </div>
          </div>
        ))}
        {!products.length && <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No products match your search.</p>}
      </div>
    </div>
  );
}
