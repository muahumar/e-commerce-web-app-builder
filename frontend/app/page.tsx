import { StoreQuickLaunch } from "./StoreQuickLaunch";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FAF6F0] via-[#F7EFE2] to-[#EFE2CE]">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
            <span className="h-2 w-2 rounded-full bg-red-700" />
            Multi-Tenant SaaS Platform
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">
            E-Commerce Web Application Builder
          </h1>
          <p className="mt-4 text-base text-stone-700">
            Launch isolated, customizable storefronts for multiple client businesses from a single control panel.
            Select a portal below to get started.
          </p>
        </div>

        <StoreQuickLaunch />
      </div>
    </main>
  );
}
