"use client";

import dynamic from "next/dynamic";

import { shell } from "@/lib/ui";

/** Client-only: wagmi + locale formatting must not SSR; avoids hydration mismatches. */
const BorrowClient = dynamic(() => import("./BorrowClient").then((mod) => mod.BorrowClient), {
  ssr: false,
  loading: () => (
    <main className={shell}>
      <p className="text-sm text-slate-400">Loading borrow…</p>
    </main>
  ),
});

export function BorrowPageClient() {
  return <BorrowClient />;
}
