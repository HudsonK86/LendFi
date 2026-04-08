import Link from "next/link";

import { AdminAnalyticsPanel } from "./AdminAnalyticsPanel";
import { AdminOraclePanel } from "./AdminOraclePanel";
import { SignOutButton } from "./SignOutButton";

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200/90">
        Admin
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Protocol controls</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        You are signed in. Use the authorized wallet in the header to update on-chain oracle parameters.
      </p>
      <AdminOraclePanel />
      <AdminAnalyticsPanel />
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <SignOutButton />
        <Link href="/" className="text-sm font-medium text-cyan-400/90 hover:text-cyan-300">
          ← Back to app
        </Link>
      </div>
    </main>
  );
}
