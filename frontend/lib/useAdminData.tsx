"use client";

import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "./admin";

/** Loads GET /store/:slug/admin{path}; reload() refetches. */
export function useAdminData<T>(store: string, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [n, setN] = useState(0);

  useEffect(() => {
    let live = true;
    adminFetch<T>(store, path)
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [store, path, n]);

  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

/** Wraps a mutation: shows success / error text and runs `after` (usually reload). */
export function useAction(after?: () => void) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setError("");
      setNotice("");
      try {
        await fn();
        if (ok) setNotice(ok);
        after?.();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [after]
  );
  return { run, error, notice };
}

export const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
export const inputCls =
  "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function Messages({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 break-words rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
    </>
  );
}
