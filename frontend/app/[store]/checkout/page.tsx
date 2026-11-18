"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { customerToken, money, sfFetch, type CartData, type SfOrder } from "@/lib/storefront";

const noop = () => () => {};

export default function CheckoutPage() {
  const { store } = useParams<{ store: string }>();
  const [cart, setCart] = useState<CartData | null>(null);
  const isLoggedIn = useSyncExternalStore(noop, () => !!customerToken.get(store), () => false);
  const [guestEmail, setGuestEmail] = useState("");
  const [address, setAddress] = useState({ name: "", line1: "", city: "", postalCode: "", country: "" });
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState<{ code: string; discountAmount: number; totalAmount: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<SfOrder | null>(null);

  useEffect(() => {
    sfFetch<CartData>(store, "/cart").then(setCart).catch((e) => setError(e.message));
  }, [store]);

  async function applyCoupon() {
    setError("");
    if (!couponCode.trim()) return;
    try {
      const r = await sfFetch<{ code: string; discountAmount: number; totalAmount: number }>(store, "/coupons/validate", {
        method: "POST",
        json: { code: couponCode, subtotal: cart?.subtotal },
      });
      setDiscount(r);
    } catch (e) {
      setDiscount(null);
      setError((e as Error).message);
    }
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const intent = await sfFetch<{ paymentIntentId: string; stripeMode: string }>(store, "/checkout/intent", {
        method: "POST",
        json: { ...(discount ? { couponCode: discount.code } : {}) },
      });
      const res = await sfFetch<{ order: SfOrder }>(store, "/checkout/confirm", {
        method: "POST",
        json: {
          paymentIntentId: intent.paymentIntentId,
          shippingAddress: address,
          ...(!isLoggedIn ? { guestEmail } : {}),
          ...(discount ? { couponCode: discount.code } : {}),
        },
      });
      setOrder(res.order);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border p-6">
        <h1 className="text-2xl font-bold text-green-700">Order Confirmed!</h1>
        <p className="mt-2 text-sm text-gray-600">Order #{order._id.slice(-8)} · Status: {order.status}</p>
        <p className="mt-1 text-sm">Total paid: <strong>{money(order.totalAmount)}</strong></p>
        <div className="mt-6 flex gap-4 text-sm">
          <Link href={`/${store}`} className="underline">Continue shopping</Link>
          {isLoggedIn && <Link href={`/${store}/orders`} className="underline">View order history</Link>}
        </div>
      </div>
    );
  }

  if (!cart) return <p>Loading checkout…</p>;
  if (!cart.items.length) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Checkout</h1>
        <p className="mt-3 text-sm text-gray-500">Your cart is empty.</p>
        <Link href={`/${store}`} className="mt-3 inline-block text-sm underline">Back to shop</Link>
      </div>
    );
  }

  const input = "w-full rounded border p-2 text-sm";

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form onSubmit={placeOrder} className="space-y-4">
        <h1 className="text-2xl font-bold">Checkout</h1>
        {!isLoggedIn && (
          <div>
            <label className="text-xs text-gray-500">Guest email (for order confirmation)</label>
            <input className={input} type="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        )}
        <h2 className="font-semibold">Shipping Address</h2>
        <input className={input} required placeholder="Full name" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} />
        <input className={input} required placeholder="Street address" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <input className={input} required placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          <input className={input} placeholder="Postal code" value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
        </div>
        <input className={input} placeholder="Country" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} />

        <div className="rounded border bg-gray-50 p-3 text-xs text-gray-600">
          Payment: Stripe Test Mode (no real card charged).
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-black py-2.5 text-sm text-white disabled:opacity-50">
          {busy ? "Processing…" : `Pay ${money(discount ? discount.totalAmount : cart.subtotal)}`}
        </button>
      </form>

      <div className="h-fit rounded-lg border p-6">
        <h2 className="font-semibold">Order Summary</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {cart.items.map((i) => (
            <li key={i.productId} className="flex justify-between">
              <span>{i.quantity}× {i.name}</span>
              <span>{money(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <input className={input} placeholder="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          <button type="button" onClick={applyCoupon} className="rounded border px-4 text-sm">Apply</button>
        </div>
        <div className="mt-4 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(cart.subtotal)}</span></div>
          {discount && (
            <div className="flex justify-between text-green-700"><span>Discount ({discount.code})</span><span>−{money(discount.discountAmount)}</span></div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{money(discount ? discount.totalAmount : cart.subtotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
