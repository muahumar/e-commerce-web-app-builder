"use client";

import { useState } from "react";
import { sfFetch } from "@/lib/storefront";

export function AddToCartButton({ store, productId, disabled }: { store: string; productId: string; disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function add() {
    setStatus("adding");
    setMsg("");
    try {
      await sfFetch(store, "/cart/items", { method: "POST", json: { productId, quantity: 1 } });
      setStatus("added");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      setStatus("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled || status === "adding"}
        onClick={add}
        className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-[#FAF6F0] transition disabled:opacity-40 ${
          status === "added" ? "bg-emerald-700" : "bg-red-800 hover:bg-red-900"
        }`}
      >
        {disabled ? "Out of stock" : status === "adding" ? "Adding…" : status === "added" ? "✓ Added to cart" : "Add to cart"}
      </button>
      {status === "error" && msg && <p className="mt-1.5 text-xs text-red-700">{msg}</p>}
    </div>
  );
}
