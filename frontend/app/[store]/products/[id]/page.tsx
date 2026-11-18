import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { money, sfServerFetch, type SfProduct, type SfReview, type StoreInfo } from "@/lib/storefront";
import { AddToCartButton } from "../../AddToCartButton";
import { ReviewForm } from "./ReviewForm";

export async function generateMetadata({ params }: { params: Promise<{ store: string; id: string }> }): Promise<Metadata> {
  const { store, id } = await params;
  const data = await sfServerFetch<{ product: SfProduct }>(store, `/products/${id}`);
  if (!data) return { title: "Product not found" };
  return { title: data.product.name, description: data.product.description || `${data.product.name} — ${money(data.product.price)}` };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ store: string; id: string }> }) {
  const { store, id } = await params;
  const [sfData, prodData] = await Promise.all([
    sfServerFetch<{ store: StoreInfo }>(store, "/storefront"),
    sfServerFetch<{ product: SfProduct; reviews: SfReview[] }>(store, `/products/${id}`),
  ]);

  if (!prodData || !sfData) notFound();
  const { product: p, reviews } = prodData;
  const features = sfData.store.features;

  return (
    <div>
      <Link href={`/${store}`} className="text-sm text-gray-500 underline">← Back to catalog</Link>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          {p.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[0]} alt={p.name} className="w-full rounded-lg border object-cover" />
          ) : (
            <div className="flex h-72 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">No image</div>
          )}
          {p.images.length > 1 && (
            <div className="flex gap-2">
              {p.images.slice(1).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="h-16 w-16 rounded border object-cover" />
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold">{p.name}</h1>
          {features.multiVendor && p.sellerName && (
            <p className="mt-1 text-sm text-gray-500">Sold by {p.sellerName}</p>
          )}
          <div className="mt-3 flex items-center gap-4">
            <span className="text-2xl font-semibold">{money(p.price)}</span>
            {features.reviews !== false && p.ratingCount > 0 && (
              <span className="text-sm text-yellow-600">★ {p.ratingAvg.toFixed(1)} ({p.ratingCount} reviews)</span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-600">{p.stock > 0 ? `${p.stock} available` : "Out of stock"}</p>
          {p.description && <p className="mt-4 whitespace-pre-line text-sm text-gray-700">{p.description}</p>}

          {p.variants && p.variants.length > 0 && (
            <div className="mt-4 space-y-2 text-sm">
              {p.variants.map((v) => (
                <div key={v.name}><span className="font-medium">{v.name}:</span> {v.options.join(", ")}</div>
              ))}
            </div>
          )}

          <div className="mt-6 max-w-xs">
            <AddToCartButton store={store} productId={p._id} disabled={p.stock < 1} />
          </div>
        </div>
      </div>

      {features.reviews !== false && (
        <section className="mt-12 border-t pt-8">
          <h2 className="text-xl font-bold">Customer Reviews</h2>
          <div className="mt-4 space-y-3">
            {reviews.map((r) => (
              <div key={r._id} className="rounded-lg border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.customerName}</span>
                  <span className="text-yellow-600">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                </div>
                {r.comment && <p className="mt-1 text-gray-700">{r.comment}</p>}
              </div>
            ))}
            {!reviews.length && <p className="text-sm text-gray-500">No approved reviews yet.</p>}
          </div>
          <ReviewForm store={store} productId={p._id} />
        </section>
      )}
    </div>
  );
}
