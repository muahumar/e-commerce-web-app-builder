"use client";

import { useState } from "react";
import { customerToken, sfFetch } from "@/lib/storefront";

export function ReviewForm({ store, productId }: { store: string; productId: string }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!customerToken.get(store)) {
      setErr("Please sign in on the Account page to submit a review.");
      return;
    }
    setBusy(true);
    try {
      await sfFetch(store, `/products/${productId}/reviews`, { method: "POST", json: { rating, comment } });
      setMsg("Review submitted and awaiting store admin approval.");
      setComment("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-lg space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Write a review</h3>
      <p className="text-xs text-gray-500">Only verified purchasers can review this product.</p>
      <select className="rounded border p-2 text-sm" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>{n} ★</option>
        ))}
      </select>
      <textarea className="w-full rounded border p-2 text-sm" rows={3} placeholder="Share your thoughts…" value={comment} onChange={(e) => setComment(e.target.value)} />
      {err && <p className="text-xs text-red-600">{err}</p>}
      {msg && <p className="text-xs text-green-700">{msg}</p>}
      <button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
