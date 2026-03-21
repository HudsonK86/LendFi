import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <section className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">Shared-pool lending</p>
        <h1 className="mt-2 text-4xl font-semibold text-neutral-900">Lend and borrow with confidence</h1>
        <p className="mt-3 max-w-3xl text-neutral-700">
          LendFi is a shared-liquidity protocol. Lenders supply stablecoin liquidity, borrowers post ETH collateral,
          and risk is managed on-chain with health-factor checks and liquidation rules.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pool" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            Go to Pool
          </Link>
          <Link href="/borrow" className="rounded border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700">
            Borrow USDT
          </Link>
          <Link href="/dashboard" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">
            Open Dashboard
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border border-neutral-200 p-4">
            <h3 className="font-medium">1) Deposit collateral</h3>
            <p className="mt-1 text-sm text-neutral-600">Borrowers deposit ETH collateral to unlock borrowing power.</p>
          </article>
          <article className="rounded-lg border border-neutral-200 p-4">
            <h3 className="font-medium">2) Borrow USDT</h3>
            <p className="mt-1 text-sm text-neutral-600">Borrow against collateral up to LTV and available pool liquidity.</p>
          </article>
          <article className="rounded-lg border border-neutral-200 p-4">
            <h3 className="font-medium">3) Repay with interest</h3>
            <p className="mt-1 text-sm text-neutral-600">Debt accrues over time and can be repaid partially or fully.</p>
          </article>
          <article className="rounded-lg border border-neutral-200 p-4">
            <h3 className="font-medium">4) Withdraw collateral / liquidation</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Healthy positions can withdraw collateral; risky ones become liquidatable if HF drops below 1.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-neutral-200 p-4">
          <h3 className="font-medium">Variable APY model</h3>
          <p className="mt-1 text-sm text-neutral-600">Borrow and supply rates adjust with utilization.</p>
        </article>
        <article className="rounded-lg border border-neutral-200 p-4">
          <h3 className="font-medium">Health factor protection</h3>
          <p className="mt-1 text-sm text-neutral-600">Borrow limits and liquidation thresholds are enforced on-chain.</p>
        </article>
        <article className="rounded-lg border border-neutral-200 p-4">
          <h3 className="font-medium">Transparent protocol state</h3>
          <p className="mt-1 text-sm text-neutral-600">Dashboard combines live on-chain stats and analytics history.</p>
        </article>
      </section>

      <section className="mt-8 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-xl font-semibold">Pool snapshot</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Live metrics are available on the dashboard. This landing view keeps placeholders for quick orientation.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <p>Total supplied: loading...</p>
          <p>Total borrowed: loading...</p>
          <p>Utilization: loading...</p>
          <p>Supply APY: loading...</p>
        </div>
      </section>
    </main>
  );
}

