"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { money, sfFetch, type CartData } from "@/lib/storefront";

export default function CartPage() {
  const { store } = useParams<{ store: string }>();
  const [cart, setCart] = useState<CartData | null>(null);
  const [error, setError] = useState("");
  const [n, setN] = useState(0);

  const reload = useCallback(() => setN((x) => x + 1), []);

  useEffect(() => {
    let live = true;
    sfFetch<CartData>(store, "/cart")
      .then((d) => live && setCart(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [store, n]);

  async function updateQty(productId: string, quantity: number) {
    setError("");
    try {
      const d = await sfFetch<CartData>(store, `/cart/items/${productId}`, { method: "PATCH", json: { quantity } });
      setCart(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function clear() {
    await sfFetch(store, "/cart", { method: "DELETE" });
    reload();
  }

  if (!cart && !error) return <p>Loading cart…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Shopping Cart</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {cart && !cart.items.length ? (
        <div className="mt-6">
          <p className="text-sm text-gray-500">Your cart is empty.</p>
          <Link href={`/${store}`} className="mt-3 inline-block text-sm underline">Continue shopping</Link>
        </div>
      ) : (
        cart && (
          <div className="mt-6 space-y-4">
            <ul className="divide-y rounded-lg border">
              {cart.items.map((item) => (
                <li key={item.productId} className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
                  <div className="flex items-center gap-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt={item.name} className="h-14 w-14 rounded object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded bg-gray-100" />
                    )}
                    <div>
                      <Link href={`/${store}/products/${item.productId}`} className="font-medium hover:underline">{item.name}</Link>
                      <div className="text-xs text-gray-500">{money(item.price)} each</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="rounded border px-2 py-1" onClick={() => updateQty(item.productId, item.quantity - 1)}>−</button>
                    <span>{item.quantity}</span>
                    <button className="rounded border px-2 py-1" disabled={item.quantity >= item.stock} onClick={() => updateQty(item.productId, item.quantity + 1)}>+</button>
                    <span className="w-20 text-right font-semibold">{money(item.lineTotal)}</span>
                    <button className="text-xs text-red-600 underline" onClick={() => updateQty(item.productId, 0)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between">
              <button className="text-sm text-gray-500 underline" onClick={clear}>Clear cart</button>
              <div className="text-right">
                <div className="text-lg font-bold">Subtotal: {money(cart.subtotal)}</div>
                <Link href={`/${store}/checkout`} className="mt-2 inline-block rounded bg-black px-6 py-2 text-sm text-white">Proceed to Checkout</Link>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
