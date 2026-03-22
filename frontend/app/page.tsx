import Link from "next/link";

import { btnNeutral, btnPrimary, card, cn, linkSubtle, shell } from "@/lib/ui";

export default function HomePage() {
  return (
    <main className={shell}>
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-cyan-950/30 p-8 sm:p-10",
        )}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/90">Shared-pool lending</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
          Supply stablecoins. Borrow against ETH. Track risk like a production protocol.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
          LendFi is a compact demo: one pool, one borrow asset, native ETH collateral, on-chain health factor and
          liquidations — styled like a serious DeFi app for your portfolio.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/pool" className={btnPrimary}>
            Open pool
          </Link>
          <Link href="/borrow" className={btnNeutral}>
            Borrow USDT
          </Link>
          <Link href="/dashboard" className={cn(btnNeutral, "border-transparent bg-transparent hover:bg-slate-800/50")}>
            Dashboard
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-100">How it works</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Supply liquidity",
              body: "Deposit MockUSDT into the shared pool and receive FR shares.",
            },
            {
              title: "Borrow with ETH",
              body: "Post collateral, borrow up to LTV limits with utilization-based rates.",
            },
            {
              title: "Repay & manage risk",
              body: "Repay debt, watch health factor, withdraw collateral when safe.",
            },
            {
              title: "Liquidations",
              body: "When HF < 1, liquidators can repay debt and seize collateral (+ bonus).",
            },
          ].map((item) => (
            <article key={item.title} className={card}>
              <h3 className="font-medium text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          { title: "Utilization curve", body: "Borrow & supply APY respond to pool utilization." },
          { title: "Health factor", body: "Borrower limits and liquidation threshold enforced on-chain." },
          { title: "Analytics", body: "Dashboard + optional Postgres logs for admin actions." },
        ].map((item) => (
          <article key={item.title} className={card}>
            <h3 className="text-sm font-medium text-cyan-300/90">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/30 p-6 text-center">
        <p className="text-sm text-slate-400">
          Ready to explore live metrics?{" "}
          <Link href="/dashboard" className={linkSubtle}>
            Open the dashboard
          </Link>
        </p>
      </section>
    </main>
  );
}
