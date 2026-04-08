import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import {
  BASE_BORROW_APY_BPS,
  computeBorrowApyBps,
  computeSupplyApyBps,
  EXAMPLE_UTIL_BPS,
  formatBpsAsPercent,
  LIQUIDATION_BONUS_BPS,
  LIQUIDATION_THRESHOLD_BPS,
  MAX_LTV_BPS,
  OPTIMAL_UTIL_BPS,
  RESERVE_FACTOR_BPS,
} from "@/lib/protocol-params";
import { card, linkSubtle, shell, tableWrap, td, th } from "@/lib/ui";

export const metadata: Metadata = {
  title: "How LendFi works · LendFi",
  description:
    "Plain-language guide to interest rates, position health (debt vs collateral), borrowing limits, and liquidations on LendFi.",
};

function ParamTable({
  rows,
}: {
  rows: Array<{ name: string; value: string; note?: string }>;
}) {
  return (
    <div className={tableWrap}>
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead className="border-b border-slate-800 bg-slate-950/50">
          <tr>
            <th className={th}>Topic</th>
            <th className={th}>Setting</th>
            <th className={th}>What it means for you</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-slate-800/80">
              <td className={`${td} font-medium text-slate-100`}>{r.name}</td>
              <td className={`${td} text-cyan-200/90`}>{r.value}</td>
              <td className={`${td} text-slate-400`}>{r.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProtocolPage() {
  const apyExamples = EXAMPLE_UTIL_BPS.map((u) => ({
    utilBps: u,
    utilPct: u / 100,
    borrowBps: computeBorrowApyBps(u),
    supplyBps: computeSupplyApyBps(u),
  }));

  return (
    <main className={shell}>
      <PageHeader
        title="How LendFi works"
        subtitle="A simple guide to the numbers you see in the app — interest, safety limits, and what happens when a loan becomes risky."
      />

      <nav className="mt-8 flex flex-wrap gap-2 text-xs">
        {[
          ["#glossary", "Key terms"],
          ["#constants", "Limits & settings"],
          ["#utilization", "Pool usage"],
          ["#apy", "Interest rates"],
          ["#interest", "How interest adds up"],
          ["#oracle", "ETH price"],
          ["#borrow-cap", "How much you can borrow"],
          ["#position-health", "Position health"],
          ["#liquidation", "Liquidation"],
          ["#fr", "Pool shares (FR)"],
          ["#examples", "Examples"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-full border border-slate-700/80 px-2.5 py-1 text-cyan-400/90 hover:bg-slate-800/60"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="glossary" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Key terms</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            <strong className="text-slate-200">USDT</strong> — The dollar-pegged token you supply to the pool, borrow, and use to repay loans.
          </p>
          <p>
            <strong className="text-slate-200">FR</strong> — Your “receipt” for supplying to the pool. More FR means a larger share of the pool when you
            withdraw.
          </p>
          <p>
            <strong className="text-slate-200">Collateral</strong> — ETH you lock in the protocol when you borrow. If you can’t keep the loan healthy, this
            ETH can be taken in a liquidation.
          </p>
          <p>
            <strong className="text-slate-200">Debt</strong> — What you owe in USDT, including interest that builds over time.
          </p>
          <p>
            <strong className="text-slate-200">APY</strong> — “Annual percentage yield” — a yearly rate used to show borrow cost and supply earnings. The app
            may show it as a percent (e.g. 2.5%).
          </p>
        </div>
      </section>

      <section id="constants" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Main limits & settings</h2>
        <p className="mt-2 text-sm text-slate-400">
          These are fixed rules built into the protocol so everyone faces the same risk limits.
        </p>
        <div className="mt-4">
          <ParamTable
            rows={[
              {
                name: "Max loan (LTV)",
                value: `${MAX_LTV_BPS / 100}%`,
                note: "You can’t owe more than this share of your collateral’s value in USDT terms.",
              },
              {
                name: "Liquidation line (debt vs collateral)",
                value: `${LIQUIDATION_THRESHOLD_BPS / 100}%`,
                note: "If your current debt exceeds this share of your collateral’s value (USDT), your position can be liquidated — not the same as the max loan above.",
              },
              {
                name: "Liquidation bonus",
                value: `${LIQUIDATION_BONUS_BPS / 100}%`,
                note: "Extra incentive for someone who repays your debt during liquidation.",
              },
              {
                name: "Reserve (of interest)",
                value: `${RESERVE_FACTOR_BPS / 100}%`,
                note: "Share of borrower interest that stays with the protocol reserves.",
              },
              {
                name: "Base borrow rate",
                value: `${BASE_BORROW_APY_BPS / 100}%`,
                note: "Starting point for borrow cost when the pool is empty.",
              },
              {
                name: "“Target” pool usage",
                value: `${OPTIMAL_UTIL_BPS / 100}%`,
                note: "After this usage, borrow rates rise faster — encourages balance between lending and borrowing.",
              },
            ]}
          />
        </div>
      </section>

      <section id="utilization" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Pool usage (utilization)</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            <strong className="text-slate-200">In one sentence:</strong> out of all USDT that lenders have supplied, what fraction is currently borrowed?
          </p>
          <p>
            <strong className="text-slate-200">Example:</strong> if suppliers put in <strong className="text-slate-300">$100,000</strong> and borrowers have taken{" "}
            <strong className="text-slate-300">$80,000</strong>, usage is <strong className="text-slate-300">80%</strong>. When usage is high, borrow rates
            typically go up so borrowing doesn’t outrun available liquidity.
          </p>
        </div>
      </section>

      <section id="apy" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Borrow & supply interest</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            <strong className="text-slate-200">Borrowers</strong> pay a rate that <em>increases</em> as the pool gets busier — first on a gentle slope up to{" "}
            {OPTIMAL_UTIL_BPS / 100}% usage, then more steeply after that (so very high usage gets expensive).
          </p>
          <p>
            <strong className="text-slate-200">Suppliers</strong> earn from what borrowers pay. A slice ({RESERVE_FACTOR_BPS / 100}%) goes to protocol reserves
            first; the rest is shared with lenders in proportion to pool usage.
          </p>
        </div>

        <h3 className="mt-8 text-base font-semibold text-slate-200">Example rates at different pool usage</h3>
        <p className="mt-2 text-sm text-slate-500">Illustrative yearly rates at a few usage levels:</p>
        <div className="mt-4">
          <div className={tableWrap}>
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/50">
                <tr>
                  <th className={th}>Pool usage</th>
                  <th className={th}>Borrow cost (APY)</th>
                  <th className={th}>Supply yield (APY)</th>
                </tr>
              </thead>
              <tbody>
                {apyExamples.map((row) => (
                  <tr key={row.utilBps} className="border-b border-slate-800/80">
                    <td className={`${td} tabular-nums`}>{row.utilPct}%</td>
                    <td className={`${td} tabular-nums`}>{formatBpsAsPercent(row.borrowBps)}</td>
                    <td className={`${td} tabular-nums text-emerald-300/90`}>{formatBpsAsPercent(row.supplyBps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="interest" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">How interest adds up</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            Interest accrues over time based on how long you’ve owed and the borrow rate. When you borrow, repay, or change your position, the protocol settles
            your debt using the <strong className="text-slate-200">current</strong> pool usage and borrow rate.
          </p>
          <p>
            Part of new interest increases what you owe; a small part ({RESERVE_FACTOR_BPS / 100}%) goes to protocol reserves. The rate can change over time as
            more people borrow or repay.
          </p>
        </div>
      </section>

      <section id="oracle" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">ETH price (oracle)</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            Your ETH collateral is valued in <strong className="text-slate-200">USDT per 1 ETH</strong> using a price set by an authorized admin wallet (for
            example, “1 ETH = 2,000 USDT”).
          </p>
          <p>
            <strong className="text-slate-200">Example:</strong> you hold <strong className="text-slate-300">2 ETH</strong> and the price is{" "}
            <strong className="text-slate-300">2,000 USDT per ETH</strong>. Your collateral is treated as worth <strong className="text-slate-300">4,000 USDT</strong>{" "}
            for borrow limits and position health.
          </p>
        </div>
      </section>

      <section id="borrow-cap" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">How much you can borrow</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            Your total debt (what you owe, including interest) must stay <strong className="text-slate-200">at or below {MAX_LTV_BPS / 100}%</strong> of your
            collateral’s value in USDT.
          </p>
          <p>
            <strong className="text-slate-200">Example:</strong> collateral worth <strong className="text-slate-300">10,000 USDT</strong> → max debt around{" "}
            <strong className="text-slate-300">7,000 USDT</strong>. If you already owe 5,000 USDT, you can borrow about{" "}
            <strong className="text-slate-300">2,000 USDT</strong> more (until interest or price moves).
          </p>
        </div>
      </section>

      <section id="position-health" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Position health</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            The app shows how your <strong className="text-slate-200">current debt</strong> (USDT, including accrued interest) compares to your{" "}
            <strong className="text-slate-200">collateral value</strong> (your ETH priced in USDT). Think of it as{" "}
            <strong className="text-slate-200">debt ÷ collateral value</strong> — a percentage.
          </p>
          <p>
            The protocol’s <strong className="text-slate-200">liquidation line</strong> is <strong className="text-slate-200">{LIQUIDATION_THRESHOLD_BPS / 100}%</strong>: if
            your debt is <em>greater than</em> that fraction of your collateral value, you can be liquidated. That {LIQUIDATION_THRESHOLD_BPS / 100}% line is{" "}
            <em>not</em> the same as the {MAX_LTV_BPS / 100}% borrow cap — you start lower, and interest can push you toward the line over time.
          </p>
          <p>
            If you have <strong className="text-slate-200">no debt</strong>, there’s nothing to liquidate — the app shows 0% debt versus collateral.
          </p>
        </div>
      </section>

      <section id="liquidation" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Liquidation</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            If your debt rises <strong className="text-slate-200">above {LIQUIDATION_THRESHOLD_BPS / 100}%</strong> of your collateral value (USDT), anyone can
            repay part of your USDT debt and receive some of your ETH. They get a{" "}
            <strong className="text-slate-200">{LIQUIDATION_BONUS_BPS / 100}%</strong> incentive on top of a fair exchange — that’s the liquidation bonus.
          </p>
          <p>
            They can’t repay more than you owe, and they can’t take more ETH than you still have locked.
          </p>
        </div>
      </section>

      <section id="fr" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Pool shares (FR)</h2>
        <div className={`${card} mt-4 space-y-4 text-sm leading-relaxed text-slate-400`}>
          <p>
            The <strong className="text-slate-200">first</strong> supplier’s USDT mints FR <strong className="text-slate-200">one-for-one</strong> (1 USDT → 1 FR).
          </p>
          <p>
            <strong className="text-slate-200">Later</strong> suppliers get FR based on how big the pool already is — you receive a fair share of the pool’s
            total value, not just raw dollars in.
          </p>
          <p>
            When you withdraw, you burn FR and get USDT back based on your share, as long as enough USDT is <em>available</em> in the pool (not all of it may be
            sitting idle if borrowers have taken loans).
          </p>
        </div>
      </section>

      <section id="examples" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-slate-100">Quick examples</h2>
        <div className={`${card} mt-4 space-y-6 text-sm leading-relaxed text-slate-400`}>
          <div>
            <h3 className="font-medium text-slate-200">Position health</h3>
            <p className="mt-2">
              Say ETH is worth <strong className="text-slate-300">2,000 USDT</strong> each, you deposited <strong className="text-slate-300">1 ETH</strong> as
              collateral, and you owe <strong className="text-slate-300">1,000 USDT</strong>. Your collateral is worth <strong className="text-slate-300">2,000 USDT</strong>,
              so your debt is <strong className="text-slate-300">50%</strong> of collateral value — below the <strong className="text-slate-300">{LIQUIDATION_THRESHOLD_BPS / 100}%</strong>{" "}
              liquidation line, so you’re not in the liquidation zone.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate-200">Rates when the pool is {OPTIMAL_UTIL_BPS / 100}% used</h3>
            <p className="mt-2">
              At that usage level, borrow cost is about{" "}
              <strong className="text-slate-300">{formatBpsAsPercent(computeBorrowApyBps(OPTIMAL_UTIL_BPS))}</strong> per year and supply yield about{" "}
              <strong className="text-slate-300">{formatBpsAsPercent(computeSupplyApyBps(OPTIMAL_UTIL_BPS))}</strong> — see the table above for exact figures.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-dashed border-slate-700/80 bg-slate-950/30 p-6 text-center">
        <p className="text-sm text-slate-400">
          Back to{" "}
          <Link href="/" className={linkSubtle}>
            Home
          </Link>{" "}
          ·{" "}
          <Link href="/dashboard" className={linkSubtle}>
            Dashboard
          </Link>{" "}
          ·{" "}
          <Link href="/pool" className={linkSubtle}>
            Pool
          </Link>
        </p>
      </section>
    </main>
  );
}
