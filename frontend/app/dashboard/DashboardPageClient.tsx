"use client";

import dynamic from "next/dynamic";

import { shell } from "@/lib/ui";

/** Client-only: wagmi + locale formatting must not SSR; avoids hydration mismatches. */
const DashboardClient = dynamic(() => import("./DashboardClient").then((mod) => mod.DashboardClient), {
  ssr: false,
  loading: () => (
    <main className={shell}>
      <p className="text-sm text-slate-400">Loading dashboard…</p>
    </main>
  ),
});

export function DashboardPageClient() {
  return <DashboardClient />;
}
