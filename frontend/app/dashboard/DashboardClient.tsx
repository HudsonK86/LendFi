"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { FRToken_ABI, LendingPool_ABI, MockPriceOracle_ABI } from "@/lib/abi";
import type { AdminActionLog } from "@/lib/types";
import { card, code, input, label, shell, tableWrap, td, th } from "@/lib/ui";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtOracleAddress = process.env.NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS as `0x${string}` | undefined;
const frTokenAddress = process.env.NEXT_PUBLIC_FRTOKEN_ADDRESS as `0x${string}` | undefined;

type AnalyticsResponse = {
  recentActions: AdminActionLog[];
  actionCounts: Array<{ action: string; count: number }>;
  liquidationRecords: unknown[];
  apySnapshots: unknown[];
  utilizationSnapshots: unknown[];
  notes: string;
  error?: string;
};

function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPctBps(value?: bigint) {
  if (value == null) return "—";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

export function DashboardClient() {
  const [mounted, setMounted] = useState(false);
  const [borrowerAddressInput, setBorrowerAddressInput] = useState("");
  const [lenderAddressInput, setLenderAddressInput] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const { address } = useAccount();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/dashboard/analytics");
        const data = (await res.json()) as AnalyticsResponse;
        if (!active) return;
        if (!res.ok) {
          setAnalyticsError(data.error ?? "Failed to load analytics");
          return;
        }
        setAnalytics(data);
        setAnalyticsError(null);
      } catch {
        if (active) setAnalyticsError("Failed to load analytics");
      }
    }
    void loadAnalytics();
    const id = setInterval(() => void loadAnalytics(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const borrowerAddress = useMemo(
    () => (isAddress(borrowerAddressInput.trim()) ? (borrowerAddressInput.trim() as `0x${string}`) : undefined),
    [borrowerAddressInput],
  );
  const lenderAddress = useMemo(() => {
    const preferred = lenderAddressInput.trim() || address;
    return preferred && isAddress(preferred) ? (preferred as `0x${string}`) : undefined;
  }, [address, lenderAddressInput]);

  const availableLiquidity = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getAvailableLiquidity",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const totalSupplied = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getTotalSupplied",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const totalBorrowed = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "totalBorrowedUSDT",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const totalReserves = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "totalReservesUSDT",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const utilization = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getUtilization",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const borrowApy = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getBorrowAPY",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const supplyApy = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getSupplyAPY",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const oraclePrice = useReadContract({
    abi: MockPriceOracle_ABI,
    address: usdtOracleAddress,
    functionName: "getPrice",
    query: { enabled: Boolean(usdtOracleAddress) },
  });

  const lenderFrBalance = useReadContract({
    abi: FRToken_ABI,
    address: frTokenAddress,
    functionName: "balanceOf",
    args: lenderAddress ? [lenderAddress] : undefined,
    query: { enabled: Boolean(frTokenAddress && lenderAddress) },
  });
  const frTotalSupply = useReadContract({
    abi: FRToken_ABI,
    address: frTokenAddress,
    functionName: "totalSupply",
    query: { enabled: Boolean(frTokenAddress) },
  });
  const poolValue = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getPoolValue",
    query: { enabled: Boolean(lendingPoolAddress) },
  });

  const lenderWithdrawableEstimate = useMemo(() => {
    const shares = lenderFrBalance.data as bigint | undefined;
    const totalShares = frTotalSupply.data as bigint | undefined;
    const value = poolValue.data as bigint | undefined;
    if (shares == null || totalShares == null || value == null || totalShares === 0n) return undefined;
    return (shares * value) / totalShares;
  }, [frTotalSupply.data, lenderFrBalance.data, poolValue.data]);

  const borrowerCollateral = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "collateralETH",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });
  const borrowerDebt = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "debtUSDT",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });
  const borrowerMaxBorrow = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getMaxBorrow",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });
  const borrowerHF = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getHealthFactor",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });

  const canRender = mounted && isAddress(String(lendingPoolAddress)) && isAddress(String(frTokenAddress));
  const isLiquidatable = ((borrowerHF.data as bigint | undefined) ?? 0n) < 10n ** 18n;

  const oracleRaw = oraclePrice.data as bigint | undefined;
  const oracleHuman = oracleRaw != null ? formatUnits(oracleRaw, 18) : null;

  return (
    <main className={shell}>
      <PageHeader
        title="Dashboard"
        subtitle="Protocol metrics from the chain, plus optional PostgreSQL history for admin analytics."
      />

      {!canRender ? (
        <p className="mt-4 text-sm text-red-400">
          Set <code className={code}>NEXT_PUBLIC_LENDING_POOL_ADDRESS</code>,{" "}
          <code className={code}>NEXT_PUBLIC_FRTOKEN_ADDRESS</code>, and{" "}
          <code className={code}>NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS</code>.
        </p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Protocol overview</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Total supplied" value={fmt(totalSupplied.data as bigint | undefined)} hint="USDT in pool" />
              <StatTile label="Total borrowed" value={fmt(totalBorrowed.data as bigint | undefined)} />
              <StatTile label="Available liquidity" value={fmt(availableLiquidity.data as bigint | undefined)} />
              <StatTile label="Reserves" value={fmt(totalReserves.data as bigint | undefined)} />
              <StatTile label="Utilization" value={fmtPctBps(utilization.data as bigint | undefined)} />
              <StatTile
                label="Borrow APY"
                value={fmtPctBps(borrowApy.data as bigint | undefined)}
                hint="Variable from model"
              />
              <StatTile label="Supply APY" value={fmtPctBps(supplyApy.data as bigint | undefined)} />
              <StatTile
                label="ETH / USDT oracle"
                value={oracleHuman != null ? `${Number(oracleHuman).toLocaleString()} USDT/ETH` : "—"}
                hint={oracleRaw != null ? `Raw ${oracleRaw.toString()}` : undefined}
              />
            </div>
          </section>

          <section className={`${card} mt-8`}>
            <h2 className="text-base font-semibold text-slate-100">Lender view</h2>
            <label className="mt-4 block text-sm text-slate-300">
              <span className={label}>Lender address</span>
              <span className="ml-2 text-xs font-normal text-slate-500">(optional — defaults to connected wallet)</span>
              <input
                value={lenderAddressInput}
                onChange={(e) => setLenderAddressInput(e.target.value)}
                placeholder={address ?? "0x…"}
                className={input}
              />
            </label>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatTile label="FR balance" value={fmt(lenderFrBalance.data as bigint | undefined)} />
              <StatTile label="FR total supply" value={fmt(frTotalSupply.data as bigint | undefined)} />
              <StatTile label="Withdrawable (est.)" value={fmt(lenderWithdrawableEstimate)} />
            </div>
          </section>

          <section className={`${card} mt-6`}>
            <h2 className="text-base font-semibold text-slate-100">Borrower view</h2>
            <label className="mt-4 block text-sm text-slate-300">
              <span className={label}>Borrower address</span>
              <input
                value={borrowerAddressInput}
                onChange={(e) => setBorrowerAddressInput(e.target.value)}
                placeholder="0x…"
                className={input}
              />
            </label>
            <div className={`${tableWrap} mt-6`}>
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/50">
                  <tr>
                    <th className={th}>Collateral ETH</th>
                    <th className={th}>Debt USDT</th>
                    <th className={th}>Max borrow</th>
                    <th className={th}>Health factor</th>
                    <th className={th}>Liquidatable</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-800/80">
                    <td className={`${td} tabular-nums`}>{fmt(borrowerCollateral.data as bigint | undefined)}</td>
                    <td className={`${td} tabular-nums`}>{fmt(borrowerDebt.data as bigint | undefined)}</td>
                    <td className={`${td} tabular-nums`}>{fmt(borrowerMaxBorrow.data as bigint | undefined)}</td>
                    <td className={`${td} tabular-nums`}>{fmt(borrowerHF.data as bigint | undefined, 18, 3)}</td>
                    <td className={td}>
                      {borrowerAddress ? (
                        <span className={isLiquidatable ? "font-medium text-red-400" : "font-medium text-emerald-400/90"}>
                          {isLiquidatable ? "Yes" : "No"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className={`${card} mt-8`}>
        <h2 className="text-base font-semibold text-slate-100">Historical analytics</h2>
        <p className="mt-1 text-xs text-slate-500">PostgreSQL — admin action logs & placeholders.</p>
        {analyticsError ? <p className="mt-3 text-sm text-red-400">{analyticsError}</p> : null}
        {!analytics ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-400">{analytics.notes}</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action counts</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {analytics.actionCounts.length === 0 ? <li className="text-slate-500">No actions logged yet.</li> : null}
                  {analytics.actionCounts.map((a) => (
                    <li key={a.action} className="flex justify-between border-b border-slate-800/60 py-1">
                      <span>{a.action}</span>
                      <span className="tabular-nums text-slate-400">{a.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent actions</h3>
                <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-xs text-slate-400">
                  {analytics.recentActions.length === 0 ? <li>No recent actions.</li> : null}
                  {analytics.recentActions.map((r) => (
                    <li key={r.id} className="rounded border border-slate-800/80 bg-slate-950/40 px-2 py-1.5 font-mono">
                      {r.created_at} · {r.username} · {r.action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-600">
              Liquidation records / APY snapshots are placeholders until dedicated tables exist.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
