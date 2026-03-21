"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { FRToken_ABI, LendingPool_ABI, MockPriceOracle_ABI } from "@/lib/abi";
import type { AdminActionLog } from "@/lib/types";

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
  if (value == null) return "-";
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPctBps(value?: bigint) {
  if (value == null) return "-";
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

  // Protocol overview (on-chain)
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

  // Lender analysis
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

  // Borrower analysis
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-neutral-600">
        On-chain data is source of truth. Off-chain PostgreSQL data is analytics/history support.
      </p>

      {!canRender ? (
        <p className="mt-6 text-sm text-red-600">
          Missing env addresses or wallet state not ready. Check `NEXT_PUBLIC_LENDING_POOL_ADDRESS`,
          `NEXT_PUBLIC_FRTOKEN_ADDRESS`, and `NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS`.
        </p>
      ) : (
        <>
          <section className="mt-6 rounded border border-neutral-200 p-4">
            <h2 className="font-medium">Protocol overview (on-chain)</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <p>Total supplied: {fmt(totalSupplied.data as bigint | undefined)}</p>
              <p>Total borrowed: {fmt(totalBorrowed.data as bigint | undefined)}</p>
              <p>Available liquidity: {fmt(availableLiquidity.data as bigint | undefined)}</p>
              <p>Reserves: {fmt(totalReserves.data as bigint | undefined)}</p>
              <p>Utilization: {fmtPctBps(utilization.data as bigint | undefined)}</p>
              <p>Borrow APY: {fmtPctBps(borrowApy.data as bigint | undefined)}</p>
              <p>Supply APY: {fmtPctBps(supplyApy.data as bigint | undefined)}</p>
              <p>ETH oracle price: {fmt(oraclePrice.data as bigint | undefined)}</p>
            </div>
          </section>

          <section className="mt-6 rounded border border-neutral-200 p-4">
            <h2 className="font-medium">Lender analysis (on-chain)</h2>
            <label className="mt-3 block text-sm">
              Lender address (optional; defaults to connected wallet)
              <input
                value={lenderAddressInput}
                onChange={(e) => setLenderAddressInput(e.target.value)}
                placeholder={address ?? "0x..."}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <p>FR balance: {fmt(lenderFrBalance.data as bigint | undefined)}</p>
              <p>FR total supply: {fmt(frTotalSupply.data as bigint | undefined)}</p>
              <p>Withdrawable estimate: {fmt(lenderWithdrawableEstimate)}</p>
            </div>
          </section>

          <section className="mt-6 rounded border border-neutral-200 p-4">
            <h2 className="font-medium">Borrower analysis (on-chain)</h2>
            <label className="mt-3 block text-sm">
              Borrower address
              <input
                value={borrowerAddressInput}
                onChange={(e) => setBorrowerAddressInput(e.target.value)}
                placeholder="0x..."
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <p>Collateral ETH: {fmt(borrowerCollateral.data as bigint | undefined)}</p>
              <p>Debt USDT: {fmt(borrowerDebt.data as bigint | undefined)}</p>
              <p>Max borrow: {fmt(borrowerMaxBorrow.data as bigint | undefined)}</p>
              <p>Health factor: {fmt(borrowerHF.data as bigint | undefined, 18, 3)}</p>
              <p>
                Liquidatable:{" "}
                <span className={isLiquidatable ? "text-red-600" : "text-green-700"}>
                  {borrowerAddress ? (isLiquidatable ? "yes" : "no") : "-"}
                </span>
              </p>
            </div>
          </section>
        </>
      )}

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h2 className="font-medium">Historical analytics (off-chain/PostgreSQL)</h2>
        {analyticsError ? <p className="mt-2 text-sm text-red-600">{analyticsError}</p> : null}
        {!analytics ? (
          <p className="mt-2 text-sm text-neutral-500">Loading analytics...</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-600">{analytics.notes}</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Action counts</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {analytics.actionCounts.length === 0 ? <li>No actions logged yet.</li> : null}
                  {analytics.actionCounts.map((a) => (
                    <li key={a.action}>
                      {a.action}: {a.count}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium">Recent actions</h3>
                <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
                  {analytics.recentActions.length === 0 ? <li>No recent actions.</li> : null}
                  {analytics.recentActions.map((r) => (
                    <li key={r.id}>
                      {r.created_at} - {r.username} - {r.action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Liquidation records / APY snapshots / utilization snapshots are placeholders until dedicated tables are added.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
