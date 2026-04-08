import Link from "next/link";

import { LIQUIDATION_THRESHOLD_BPS } from "@/lib/protocol-params";
import { btnNeutral, btnPrimary, card, cn, label, linkSubtle, shell } from "@/lib/ui";

export default function HomePage() {
  return (
    <main className={shell}>
      {/* Hero */}
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-cyan-950/30 p-8 sm:p-10",
        )}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/90">LendFi · Shared-pool lending</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
          A simple lending app: earn on stablecoins, or borrow using ETH as backup.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
          Everyone puts liquidity in <strong className="text-slate-300">one shared pool</strong>. You can <strong className="text-slate-300">lend</strong> (supply)
          USDT and receive pool shares, or <strong className="text-slate-300">borrow</strong> USDT by locking ETH as collateral. Rules
          and balances are enforced on-chain by the protocol — not by a central ledger.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/pool" className={btnPrimary}>
            I want to supply
          </Link>
          <Link href="/borrow" className={btnNeutral}>
            I want to borrow
          </Link>
          <Link href="/dashboard" className={cn(btnNeutral, "border-transparent bg-transparent hover:bg-slate-800/50")}>
            Dashboard
          </Link>
        </div>
      </section>

      {/* What is this */}
      <section className="mt-14">
        <h2 className="text-lg font-semibold text-slate-100">What is LendFi, in one minute?</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-400">
          <p>
            Think of a <strong className="text-slate-300">communal pot of USDT</strong>. People who have extra USDT can add it to the pot and earn
            interest over time. People who need USDT can take a loan from that pot, but they must leave{" "}
            <strong className="text-slate-300">ETH locked as security</strong> so the system knows they can pay back.
          </p>
          <p>
            If someone’s loan becomes too risky (their collateral isn’t worth enough compared to what they owe), the protocol allows{" "}
            <strong className="text-slate-300">liquidators</strong> to step in: they repay part of the debt and receive ETH plus a small bonus. That
            protects everyone who supplied to the pool.
          </p>
          <p>
            The protocol uses <strong className="text-slate-300">USDT</strong> as the borrow asset and <strong className="text-slate-300">ETH</strong> as collateral, with
            parameters and risk rules enforced by smart contracts. The interface follows the same patterns as leading lending protocols — pool liquidity,
            utilization-based rates, position health (debt vs collateral), and liquidations — in a single-market layout.
          </p>
        </div>
      </section>

      {/* Two roles */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-100">Two main ways to use it</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className={card}>
            <p className={label}>Lenders (suppliers)</p>
            <h3 className="mt-2 text-base font-semibold text-slate-100">Put USDT in the pool</h3>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-400">
              <li>You deposit USDT into the shared pool.</li>
              <li>You receive <strong className="text-slate-300">FR tokens</strong> — your “receipt” for your share of the pool.</li>
              <li>When you want out, you return FR and withdraw your USDT (subject to what’s available in the pool).</li>
              <li>Interest rates move with how much of the pool is borrowed (utilization).</li>
            </ul>
            <div className="mt-4">
              <Link href="/pool" className={linkSubtle}>
                Go to Pool →
              </Link>
            </div>
          </article>
          <article className={card}>
            <p className={label}>Borrowers</p>
            <h3 className="mt-2 text-base font-semibold text-slate-100">Lock ETH, borrow USDT</h3>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-400">
              <li>You send ETH to the contract as <strong className="text-slate-300">collateral</strong> (like a security deposit).</li>
              <li>You can borrow USDT up to a <strong className="text-slate-300">maximum loan-to-value</strong> — you can’t borrow more than your collateral safely allows.</li>
              <li>
                The app shows <strong className="text-slate-300">position health</strong> as debt versus collateral value — if debt goes above the liquidation line (
                {LIQUIDATION_THRESHOLD_BPS / 100}%), you can be liquidated.
              </li>
              <li>You repay USDT over time; interest accrues on what you owe.</li>
            </ul>
            <div className="mt-4">
              <Link href="/borrow" className={linkSubtle}>
                Go to Borrow →
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* Steps */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-100">How a typical flow looks</h2>
        <ol className="mt-4 space-y-4">
          {[
            {
              step: "1",
              title: "Connect your wallet",
              body: "Connect MetaMask or another compatible wallet. Fund your account with ETH for gas and USDT for supply, borrow, or repay actions.",
            },
            {
              step: "2",
              title: "Lenders: approve & deposit",
              body: "You allow the pool contract to move your USDT (that’s “allowance”), then deposit. You get FR representing your share.",
            },
            {
              step: "3",
              title: "Borrowers: deposit ETH, then borrow",
              body: "Lock ETH as collateral, then borrow USDT within the safe limits shown in the app.",
            },
            {
              step: "4",
              title: "Watch position health & repay",
              body: `Keep debt at or below ${LIQUIDATION_THRESHOLD_BPS / 100}% of your collateral value (USDT). Repay USDT to reduce debt, or add collateral. If you cross the line, liquidators can act.`,
            },
            {
              step: "5",
              title: "Admin sets the ETH price",
              body: "An authorized wallet can update the oracle price so collateral and debt are valued consistently across the protocol.",
            },
          ].map((item) => (
            <li key={item.step} className={cn(card, "flex gap-4")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-sm font-bold text-cyan-300">
                {item.step}
              </span>
              <div>
                <h3 className="font-medium text-slate-100">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Glossary */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-100">Words you’ll see in the app</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          You don’t need to memorize these — but if something is confusing, this is what we mean:
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            {
              term: "Pool / liquidity",
              def: "All the USDT that lenders have supplied and that borrowers can borrow from (within rules).",
            },
            {
              term: "FR (pool share)",
              def: "A token that says “I own this fraction of the pool.” More FR ≈ larger share of the pot.",
            },
            {
              term: "Collateral",
              def: "ETH you lock so the protocol can seize it if you don’t pay — it backs your loan.",
            },
            {
              term: "Position health",
              def: `Your current debt (including interest) as a share of your collateral’s value in USDT. Above the ${LIQUIDATION_THRESHOLD_BPS / 100}% liquidation line means you can be liquidated.`,
            },
            {
              term: "Allowance",
              def: "Permission you give so the pool contract can pull USDT from your wallet up to that amount when you deposit.",
            },
            {
              term: "Liquidation",
              def: "Someone else pays part of your debt and receives some of your collateral (plus a bonus), when your position is too risky.",
            },
          ].map((row) => (
            <article key={row.term} className="rounded-lg border border-slate-800/90 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold text-cyan-300/90">{row.term}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{row.def}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Why not a bank */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-100">How is this different from a bank website?</h2>
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-sm leading-relaxed text-slate-400">
          <p>
            A bank holds your money on its servers and decides rules behind the scenes. Here, the rules are in{" "}
            <strong className="text-slate-300">public smart contracts</strong>: anyone can read how borrow limits, interest, and liquidations work.
            This app is a <strong className="text-slate-300">frontend</strong> that talks to those contracts — plus a small admin login for things like
            analytics, not for moving your crypto without your wallet.
          </p>
        </div>
      </section>

      {/* Feature strip */}
      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Rates follow usage",
            body: "When more of the pool is borrowed, borrow and supply rates adjust — like a simple utilization model.",
          },
          {
            title: "Risk is visible",
            body: "Debt vs collateral and pool stats are shown on Borrow and Dashboard so you can see where you stand.",
          },
          {
            title: "Configurable deployment",
            body: "Tune network and contract addresses to match your environment while keeping the same user-facing flows.",
          },
        ].map((item) => (
          <article key={item.title} className={card}>
            <h3 className="text-sm font-medium text-cyan-300/90">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-12 rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/30 p-8 text-center">
        <p className="text-base font-medium text-slate-200">Ready to try it?</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Open the pool to supply, or borrow to open a position — the dashboard shows protocol-wide numbers at a glance.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/pool" className={btnPrimary}>
            Open pool
          </Link>
          <Link href="/dashboard" className={btnNeutral}>
            Open dashboard
          </Link>
          <Link href="/protocol" className={btnNeutral}>
            Full protocol math
          </Link>
        </div>
      </section>
    </main>
  );
}
