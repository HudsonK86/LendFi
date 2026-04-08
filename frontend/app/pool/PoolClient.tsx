"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { formatUnits, isAddress, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { PageHeader } from "@/components/PageHeader";
import { LiquidationPanel } from "@/components/LiquidationPanel";
import { StatTile } from "@/components/StatTile";
import { PoolAnalyticsPanel } from "./PoolAnalyticsPanel";
import { FRToken_ABI, LendingPool_ABI, MockPriceOracle_ABI, MockUSDT_ABI } from "@/lib/abi";
import { getLiquidationScanAddresses } from "@/lib/liquidation-scan-addresses";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { btnNeutral, btnPrimary, card, code, input, label, shell } from "@/lib/ui";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtAddress = process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined;
const frTokenAddress = process.env.NEXT_PUBLIC_FRTOKEN_ADDRESS as `0x${string}` | undefined;
const usdtOracleAddress = process.env.NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS as `0x${string}` | undefined;

/** USDT amounts from pool (18 decimals in this project). */
function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Extra fraction digits for oracle price & FR NAV so small drift vs 0.5 / 1.0 is visible. */
const ORACLE_DISPLAY_DIGITS = 8;
const NAV_DISPLAY_DIGITS = 10;

function fmtPctBps(bps?: bigint) {
  if (bps == null) return "—";
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

function fmtToken(value?: bigint, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtEthWei(wei?: bigint, digits = 6) {
  if (wei == null) return "—";
  return `${Number(formatUnits(wei, 18)).toLocaleString("en-US", { maximumFractionDigits: digits })} ETH`;
}

function fmtWalletNativeEth(data?: { value: bigint; decimals: number }) {
  if (!data) return "—";
  return `${Number(formatUnits(data.value, data.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`;
}

type MulticallRow = { status: "success" | "failure"; result?: unknown };

function asBigint(row: MulticallRow | undefined): bigint | undefined {
  if (!row || row.status !== "success") return undefined;
  const r = row.result;
  return typeof r === "bigint" ? r : undefined;
}

export function PoolClient() {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawFrAmount, setWithdrawFrAmount] = useState("");
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const processedApproveHash = useRef<`0x${string}` | undefined>(undefined);
  const processedDepositHash = useRef<`0x${string}` | undefined>(undefined);
  const processedWithdrawHash = useRef<`0x${string}` | undefined>(undefined);

  const { address, isConnected } = useAccount();
  const { data: walletEthBalance } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: decimalsData } = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "decimals",
    query: { enabled: Boolean(usdtAddress) },
  });
  const decimals = Number(decimalsData ?? 18);

  const usdtBalance = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usdtAddress) },
  });
  const frBalance = useReadContract({
    abi: FRToken_ABI,
    address: frTokenAddress,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && frTokenAddress) },
  });
  const allowance = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "allowance",
    args: address && lendingPoolAddress ? [address, lendingPoolAddress] : undefined,
    query: { enabled: Boolean(address && usdtAddress && lendingPoolAddress) },
  });

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
  const utilization = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getUtilization",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const supplyApy = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getSupplyAPY",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const borrowApy = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getBorrowAPY",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const totalReserves = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "totalReservesUSDT",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const poolValue = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getPoolValue",
    query: { enabled: Boolean(lendingPoolAddress) },
  });
  const frTotalSupply = useReadContract({
    abi: FRToken_ABI,
    address: frTokenAddress,
    functionName: "totalSupply",
    query: { enabled: Boolean(frTokenAddress) },
  });
  const frDecimalsRead = useReadContract({
    abi: FRToken_ABI,
    address: frTokenAddress,
    functionName: "decimals",
    query: { enabled: Boolean(frTokenAddress) },
  });
  const oraclePrice = useReadContract({
    abi: MockPriceOracle_ABI,
    address: usdtOracleAddress,
    functionName: "getPrice",
    query: { enabled: Boolean(usdtOracleAddress) },
  });

  /** USDT redeemable per 1 full FR — same as `withdrawLiquidity(10**frDecimals)` / 10**usdtDecimals in human terms. */
  const frUsdtNav = useMemo(() => {
    const value = poolValue.data as bigint | undefined;
    const supply = frTotalSupply.data as bigint | undefined;
    const frD = Number(frDecimalsRead.data ?? 18);
    if (value == null || supply == null || supply === 0n || !Number.isFinite(frD) || frD < 0 || frD > 77) {
      return undefined;
    }
    const oneFr = 10n ** BigInt(frD);
    return (value * oneFr) / supply;
  }, [poolValue.data, frTotalSupply.data, frDecimalsRead.data]);

  const oracleRaw = oraclePrice.data as bigint | undefined;

  const scanAddresses = useMemo(() => getLiquidationScanAddresses(), []);

  const liquidationScanContracts = useMemo(
    () =>
      lendingPoolAddress
        ? scanAddresses.flatMap((addr) => [
            {
              address: lendingPoolAddress,
              abi: LendingPool_ABI,
              functionName: "getHealthFactor" as const,
              args: [addr],
            },
            {
              address: lendingPoolAddress,
              abi: LendingPool_ABI,
              functionName: "debtUSDT" as const,
              args: [addr],
            },
            {
              address: lendingPoolAddress,
              abi: LendingPool_ABI,
              functionName: "collateralETH" as const,
              args: [addr],
            },
          ])
        : [],
    [scanAddresses],
  );

  const liquidationScanRead = useReadContracts({
    contracts: liquidationScanContracts,
    query: {
      enabled: Boolean(lendingPoolAddress && liquidationScanContracts.length > 0),
      staleTime: 12_000,
    },
  });

  const eligibleUnderwaterRows = useMemo(() => {
    const scanData = liquidationScanRead.data;
    if (!scanData?.length || !scanAddresses.length) return [];
    const rows: { hf: bigint; debt: bigint; coll: bigint }[] = [];
    for (let i = 0; i < scanAddresses.length; i++) {
      const base = i * 3;
      const hfVal = asBigint(scanData[base] as MulticallRow);
      const debtVal = asBigint(scanData[base + 1] as MulticallRow);
      const collVal = asBigint(scanData[base + 2] as MulticallRow);
      if (hfVal == null || debtVal == null || collVal == null) continue;
      if (debtVal === 0n) continue;
      if (hfVal >= 10n ** 18n) continue;
      rows.push({ hf: hfVal, debt: debtVal, coll: collVal });
    }
    return rows;
  }, [liquidationScanRead.data, scanAddresses]);

  const totalEthBlockedScan = useMemo(() => {
    const scanData = liquidationScanRead.data;
    if (!scanData?.length || !scanAddresses.length) return undefined;
    let sum = 0n;
    for (let i = 0; i < scanAddresses.length; i++) {
      const collVal = asBigint(scanData[i * 3 + 2] as MulticallRow);
      if (collVal != null) sum += collVal;
    }
    return sum;
  }, [liquidationScanRead.data, scanAddresses]);

  const totalBorrowedLiquidatable = useMemo(
    () => eligibleUnderwaterRows.reduce((acc, r) => acc + r.debt, 0n),
    [eligibleUnderwaterRows],
  );

  const totalEthBlockedLiquidatable = useMemo(
    () => eligibleUnderwaterRows.reduce((acc, r) => acc + r.coll, 0n),
    [eligibleUnderwaterRows],
  );

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();
  const {
    data: depositHash,
    writeContract: writeDeposit,
    isPending: isDepositPending,
    error: depositError,
  } = useWriteContract();
  const {
    data: withdrawHash,
    writeContract: writeWithdraw,
    isPending: isWithdrawPending,
    error: withdrawError,
  } = useWriteContract();

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash });
  const depositReceipt = useWaitForTransactionReceipt({ hash: depositHash });
  const withdrawReceipt = useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (!approveReceipt.isSuccess || !approveHash) return;
    if (processedApproveHash.current === approveHash) return;
    processedApproveHash.current = approveHash;
    toast.success("USDT approval confirmed");
    void queryClient.invalidateQueries();
  }, [approveReceipt.isSuccess, approveHash, queryClient]);

  useEffect(() => {
    if (!depositReceipt.isSuccess || !depositHash) return;
    if (processedDepositHash.current === depositHash) return;
    processedDepositHash.current = depositHash;
    toast.success("Deposit confirmed");
    setDepositAmount("");
    void queryClient.invalidateQueries();
  }, [depositReceipt.isSuccess, depositHash, queryClient]);

  useEffect(() => {
    if (!withdrawReceipt.isSuccess || !withdrawHash) return;
    if (processedWithdrawHash.current === withdrawHash) return;
    processedWithdrawHash.current = withdrawHash;
    toast.success("Withdraw confirmed");
    setWithdrawFrAmount("");
    void queryClient.invalidateQueries();
  }, [withdrawReceipt.isSuccess, withdrawHash, queryClient]);
  useEffect(() => {
    if (approveError) toast.error(approveError.message);
  }, [approveError]);
  useEffect(() => {
    if (depositError) toast.error(depositError.message);
  }, [depositError]);
  useEffect(() => {
    if (withdrawError) toast.error(withdrawError.message);
  }, [withdrawError]);

  const parsedDeposit = useMemo(() => {
    try {
      return depositAmount.trim() ? parseUnits(depositAmount.trim(), decimals) : null;
    } catch {
      return null;
    }
  }, [decimals, depositAmount]);

  const parsedWithdrawFr = useMemo(() => {
    try {
      return withdrawFrAmount.trim() ? parseUnits(withdrawFrAmount.trim(), 18) : null;
    } catch {
      return null;
    }
  }, [withdrawFrAmount]);

  const needsApprove = parsedDeposit != null && (allowance.data as bigint | undefined ?? 0n) < parsedDeposit;
  const ready =
    Boolean(isAddress(String(usdtAddress))) &&
    Boolean(isAddress(String(frTokenAddress))) &&
    Boolean(isAddress(String(lendingPoolAddress)));

  return (
    <main className={shell}>
      <PageHeader
        title="Pool"
        subtitle="Supply USDT to earn pool shares (FR). Withdraw by burning FR. Rates move with utilization — similar to a single-market lending view."
      />

      <PoolAnalyticsPanel />

      {!mounted ? (
        <p className="mt-8 text-sm text-slate-500">Loading wallet…</p>
      ) : !isConnected ? (
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center">
          <p className="text-sm text-slate-400">Connect a wallet to supply or withdraw.</p>
          <div className="mt-4 flex justify-center">
            <WalletConnectButton />
          </div>
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Market</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total supplied (USDT)" value={fmt(totalSupplied.data as bigint | undefined)} hint="In pool" />
          <StatTile label="Total borrowed (USDT)" value={fmt(totalBorrowed.data as bigint | undefined)} />
          <StatTile label="Available liquidity (USDT)" value={fmt(availableLiquidity.data as bigint | undefined)} />
          <StatTile label="Reserves (USDT)" value={fmt(totalReserves.data as bigint | undefined)} />
          <StatTile
            label="Total ETH blocked (ETH)"
            value={
              liquidationScanRead.isPending && !liquidationScanRead.data
                ? "—"
                : totalEthBlockedScan != null
                  ? fmtEthWei(totalEthBlockedScan)
                  : "—"
            }
          />
          <StatTile label="Utilization (%)" value={fmtPctBps(utilization.data as bigint | undefined)} />
          <StatTile
            label="Borrow APY (%)"
            value={fmtPctBps(borrowApy.data as bigint | undefined)}
            hint="Variable from model"
          />
          <StatTile label="Supply APY (%)" value={fmtPctBps(supplyApy.data as bigint | undefined)} />
          <StatTile
            label="Total borrowed, liquidatable (est.) (USDT)"
            value={
              liquidationScanRead.isPending && !liquidationScanRead.data
                ? "—"
                : fmt(totalBorrowedLiquidatable)
            }
          />
          <StatTile
            label="ETH blocked, liquidatable (est.) (ETH)"
            value={
              liquidationScanRead.isPending && !liquidationScanRead.data
                ? "—"
                : fmtEthWei(totalEthBlockedLiquidatable)
            }
          />
          <StatTile
            label="ETH / USDT oracle"
            value={oracleRaw != null ? `${fmt(oracleRaw, 18, ORACLE_DISPLAY_DIGITS)} USDT/ETH` : "—"}
          />
          <StatTile
            label="FR / USDT (NAV)"
            value={frUsdtNav != null ? `${fmt(frUsdtNav, decimals, NAV_DISPLAY_DIGITS)} USDT` : "—"}
            hint={
              (frTotalSupply.data as bigint | undefined) === 0n
                ? "No FR supply yet"
                : frUsdtNav != null
                  ? "USDT per 1 FR; same as burning 1 FR via withdrawLiquidity"
                  : undefined
            }
          />
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-base font-semibold text-slate-100">Your balances</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between border-b border-slate-800/80 py-2">
              <span className="text-slate-500">Wallet USDT</span>
              <span className="tabular-nums font-medium text-slate-100">
                {fmtToken(usdtBalance.data as bigint | undefined)}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 py-2">
              <span className="text-slate-500">Wallet ETH</span>
              <span className="tabular-nums font-medium text-slate-100">
                {fmtWalletNativeEth(walletEthBalance)}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 py-2">
              <span className="text-slate-500">FR (pool shares)</span>
              <span className="tabular-nums font-medium text-slate-100">
                {fmtToken(frBalance.data as bigint | undefined)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Allowance to pool</span>
              <span className="tabular-nums font-medium text-slate-100">
                {fmtToken(allowance.data as bigint | undefined)}
              </span>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="text-base font-semibold text-slate-100">Deposit USDT</h2>
          <p className="mt-1 text-xs text-slate-500">Approve once if needed, then deposit into the pool.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm text-slate-300">
              <span className={label}>Amount</span>
              <input
                className={input}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="1000"
              />
            </label>
            {needsApprove ? (
              <button
                type="button"
                disabled={!isConnected || !ready || !parsedDeposit || isApprovePending || approveReceipt.isLoading}
                onClick={() =>
                  writeApprove({
                    abi: MockUSDT_ABI,
                    address: usdtAddress!,
                    functionName: "approve",
                    args: [lendingPoolAddress!, parsedDeposit!],
                  })
                }
                className={btnNeutral}
              >
                {isApprovePending || approveReceipt.isLoading ? "Approving…" : "Approve USDT"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!isConnected || !ready || !parsedDeposit || isDepositPending || depositReceipt.isLoading}
                onClick={() =>
                  writeDeposit({
                    abi: LendingPool_ABI,
                    address: lendingPoolAddress!,
                    functionName: "depositLiquidity",
                    args: [parsedDeposit!],
                  })
                }
                className={btnPrimary}
              >
                {isDepositPending || depositReceipt.isLoading ? "Depositing…" : "Deposit"}
              </button>
            )}
          </div>
        </section>
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="text-base font-semibold text-slate-100">Withdraw (burn FR)</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm text-slate-300">
            <span className={label}>FR amount</span>
            <input
              className={input}
              value={withdrawFrAmount}
              onChange={(e) => setWithdrawFrAmount(e.target.value)}
              placeholder="50"
            />
          </label>
          <button
            type="button"
            disabled={!isConnected || !ready || !parsedWithdrawFr || isWithdrawPending || withdrawReceipt.isLoading}
            onClick={() =>
              writeWithdraw({
                abi: LendingPool_ABI,
                address: lendingPoolAddress!,
                functionName: "withdrawLiquidity",
                args: [parsedWithdrawFr!],
              })
            }
            className={btnPrimary}
          >
            {isWithdrawPending || withdrawReceipt.isLoading ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </section>

      {isConnected ? (
        <LiquidationPanel className={`${card} mt-6`} />
      ) : null}

      {!ready ? (
        <p className="mt-8 text-sm text-red-400">
          Set <code className={code}>NEXT_PUBLIC_LENDING_POOL_ADDRESS</code>,{" "}
          <code className={code}>NEXT_PUBLIC_MOCK_USDT_ADDRESS</code>, and{" "}
          <code className={code}>NEXT_PUBLIC_FRTOKEN_ADDRESS</code> in <code className={code}>frontend/.env</code>.
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/" className="text-cyan-400/90 hover:text-cyan-300">
          ← Home
        </Link>
        <Link href="/borrow" className="text-cyan-400/90 hover:text-cyan-300">
          Borrow →
        </Link>
      </div>
    </main>
  );
}
