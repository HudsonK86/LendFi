"use client";

import dynamic from "next/dynamic";

import { shell } from "@/lib/ui";

/** Client-only: wagmi + locale formatting must not SSR; avoids hydration mismatches. */
const PoolClient = dynamic(() => import("./PoolClient").then((mod) => mod.PoolClient), {
  ssr: false,
  loading: () => (
    <main className={shell}>
      <p className="text-sm text-slate-400">Loading pool…</p>
    </main>
  ),
});

export function PoolPageClient() {
  return <PoolClient mode="analyticsOnly" />;
}
