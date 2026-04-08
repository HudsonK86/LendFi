"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { FRToken_ABI, LendingPool_ABI, MockPriceOracle_ABI } from "@/lib/abi";
import { debtToCollateralRatioBps, formatBpsAsPercent, isDebtAboveLiquidationLine } from "@/lib/protocol-params";
import { card, code, shell, tableWrap, td, th } from "@/lib/ui";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtOracleAddress = process.env.NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS as `0x${string}` | undefined;
const frTokenAddress = process.env.NEXT_PUBLIC_FRTOKEN_ADDRESS as `0x${string}` | undefined;

const BORROWER_POSITION_REFETCH_MS = 10_000;

function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtPctBps(value?: bigint) {
  if (value == null) return "—";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

export function DashboardClient() {
  const [mounted, setMounted] = useState(false);

  const { address } = useAccount();

  useEffect(() => setMounted(true), []);

  /** Dashboard is scoped to the MetaMask-connected account only. */
  const connectedAddress = useMemo(
    () => (address && isAddress(address) ? address : undefined),
    [address],
  );

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
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: Boolean(frTokenAddress && connectedAddress) },
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
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: Boolean(lendingPoolAddress && connectedAddress),
      refetchInterval: BORROWER_POSITION_REFETCH_MS,
    },
  });
  const borrowerDebt = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getDebtValue",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: Boolean(lendingPoolAddress && connectedAddress),
      refetchInterval: BORROWER_POSITION_REFETCH_MS,
    },
  });
  const borrowerCollateralValue = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getCollateralValue",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: Boolean(lendingPoolAddress && connectedAddress),
      refetchInterval: BORROWER_POSITION_REFETCH_MS,
    },
  });
  const borrowerMaxBorrow = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getMaxBorrow",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: Boolean(lendingPoolAddress && connectedAddress),
      refetchInterval: BORROWER_POSITION_REFETCH_MS,
    },
  });
  const canRender = mounted && isAddress(String(lendingPoolAddress)) && isAddress(String(frTokenAddress));

  const borrowerDebtVal = borrowerDebt.data as bigint | undefined;
  const borrowerCollateralVal = borrowerCollateralValue.data as bigint | undefined;
  const borrowerDebtRatioBps = useMemo(() => {
    if (borrowerDebtVal == null || borrowerCollateralVal == null) return undefined;
    return debtToCollateralRatioBps(borrowerDebtVal, borrowerCollateralVal);
  }, [borrowerDebtVal, borrowerCollateralVal]);
  const isLiquidatable = useMemo(() => {
    if (borrowerDebtVal == null || borrowerCollateralVal == null) return false;
    return isDebtAboveLiquidationLine(borrowerDebtVal, borrowerCollateralVal);
  }, [borrowerDebtVal, borrowerCollateralVal]);

  const oracleRaw = oraclePrice.data as bigint | undefined;
  const oracleHuman = oracleRaw != null ? formatUnits(oracleRaw, 18) : null;

  return (
    <main className={shell}>
      <PageHeader
        title="Dashboard"
        subtitle="Protocol overview plus your lender and borrower positions for the connected wallet."
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
                value={oracleHuman != null ? `${Number(oracleHuman).toLocaleString("en-US")} USDT/ETH` : "—"}
                hint={oracleRaw != null ? `Raw ${oracleRaw.toString()}` : undefined}
              />
            </div>
          </section>

          <section className={`${card} mt-8`}>
            <h2 className="text-base font-semibold text-slate-100">Your lender position</h2>
            <p className="mt-2 text-sm text-slate-500">
              {connectedAddress ? (
                <>
                  Connected:{" "}
                  <span className="font-mono text-slate-400">
                    {connectedAddress.slice(0, 6)}…{connectedAddress.slice(-4)}
                  </span>
                </>
              ) : (
                "Connect your wallet to see your FR balance and withdrawable estimate."
              )}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatTile label="FR balance" value={fmt(lenderFrBalance.data as bigint | undefined)} />
              <StatTile label="FR total supply" value={fmt(frTotalSupply.data as bigint | undefined)} />
              <StatTile label="Withdrawable (est.)" value={fmt(lenderWithdrawableEstimate)} />
            </div>
          </section>

          <section className={`${card} mt-6`}>
            <h2 className="text-base font-semibold text-slate-100">Your borrower position</h2>
            <p className="mt-2 text-sm text-slate-500">
              {connectedAddress ? (
                <>
                  Same wallet as above — collateral, debt, and health for this address.
                </>
              ) : (
                "Connect your wallet to see collateral, debt, and position health."
              )}
            </p>
            <div className={`${tableWrap} mt-6`}>
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/50">
                  <tr>
                    <th className={th}>Collateral ETH</th>
                    <th className={th}>Current debt USDT</th>
                    <th className={th}>Max borrow</th>
                    <th className={th}>Debt ÷ collateral</th>
                    <th className={th}>Liquidatable</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-800/80">
                    <td className={`${td} tabular-nums`}>{fmt(borrowerCollateral.data as bigint | undefined)}</td>
                    <td className={`${td} tabular-nums`}>{fmt(borrowerDebt.data as bigint | undefined)}</td>
                    <td className={`${td} tabular-nums`}>{fmt(borrowerMaxBorrow.data as bigint | undefined)}</td>
                    <td className={`${td} tabular-nums`}>
                      {borrowerDebtRatioBps != null ? formatBpsAsPercent(Number(borrowerDebtRatioBps), 2) : "—"}
                    </td>
                    <td className={td}>
                      {connectedAddress ? (
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
    </main>
  );
}
