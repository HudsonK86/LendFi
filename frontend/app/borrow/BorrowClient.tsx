"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { formatUnits, isAddress, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { PageHeader } from "@/components/PageHeader";
import { LendingPool_ABI, MockUSDT_ABI } from "@/lib/abi";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { StatTile } from "@/components/StatTile";
import { btnNeutral, btnPrimary, card, code, input, label, shell } from "@/lib/ui";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtAddress = process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined;

function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtWalletNativeEth(data?: { value: bigint; decimals: number }) {
  if (!data) return "—";
  return `${Number(formatUnits(data.value, data.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`;
}

function hfLabel(hf?: bigint) {
  if (hf == null) return { text: "—", barColor: "bg-slate-600", textClass: "text-slate-400" };
  const n = Number(formatUnits(hf, 18));
  if (n < 1) return { text: n.toFixed(3), barColor: "bg-red-500", textClass: "text-red-400" };
  if (n < 1.25) return { text: n.toFixed(3), barColor: "bg-amber-400", textClass: "text-amber-300" };
  return { text: n.toFixed(3), barColor: "bg-emerald-400", textClass: "text-emerald-300" };
}

function HealthFactorBar({ hf }: { hf?: bigint }) {
  const n = hf == null ? 0 : Number(formatUnits(hf, 18));
  const pct = Math.min(100, Math.max(0, (n / 2) * 100));
  const hfStyle = hfLabel(hf);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Risk meter (0–2 scale)</span>
        <span className={hfStyle.textClass}>HF {hfStyle.text}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${hfStyle.barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">&lt;1 liquidatable · ≥1.25 safer buffer</p>
    </div>
  );
}

export function BorrowClient() {
  const [mounted, setMounted] = useState(false);
  const [collateralEth, setCollateralEth] = useState("");
  const [borrowUsdt, setBorrowUsdt] = useState("");
  const [repayUsdt, setRepayUsdt] = useState("");
  const [withdrawEth, setWithdrawEth] = useState("");
  const queryClient = useQueryClient();
  const processedDepositHash = useRef<`0x${string}` | undefined>(undefined);
  const processedBorrowHash = useRef<`0x${string}` | undefined>(undefined);
  const processedApproveHash = useRef<`0x${string}` | undefined>(undefined);
  const processedRepayHash = useRef<`0x${string}` | undefined>(undefined);
  const processedWithdrawHash = useRef<`0x${string}` | undefined>(undefined);

  const { address, isConnected } = useAccount();
  const { data: walletEthBalance } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => setMounted(true), []);

  const usdtDecimalsRead = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "decimals",
    query: { enabled: Boolean(usdtAddress) },
  });
  const usdtDecimals = Number(usdtDecimalsRead.data ?? 18);

  const collateralRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "collateralETH",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && address) },
  });
  const debtRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "debtUSDT",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && address) },
  });
  const hfRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getHealthFactor",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && address) },
  });
  const maxBorrowRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getMaxBorrow",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && address) },
  });
  const collateralValueRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getCollateralValue",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && address) },
  });
  const debtValueRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getDebtValue",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && address) },
  });
  const usdtAllowanceRead = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "allowance",
    args: address && lendingPoolAddress ? [address, lendingPoolAddress] : undefined,
    query: { enabled: Boolean(address && lendingPoolAddress && usdtAddress) },
  });
  const usdtWalletRead = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usdtAddress) },
  });

  const depositCollateralTx = useWriteContract();
  const borrowTx = useWriteContract();
  const approveTx = useWriteContract();
  const repayTx = useWriteContract();
  const withdrawTx = useWriteContract();

  const depositReceipt = useWaitForTransactionReceipt({ hash: depositCollateralTx.data });
  const borrowReceipt = useWaitForTransactionReceipt({ hash: borrowTx.data });
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const repayReceipt = useWaitForTransactionReceipt({ hash: repayTx.data });
  const withdrawReceipt = useWaitForTransactionReceipt({ hash: withdrawTx.data });

  useEffect(() => {
    const hash = depositCollateralTx.data;
    if (!depositReceipt.isSuccess || !hash) return;
    if (processedDepositHash.current === hash) return;
    processedDepositHash.current = hash;
    toast.success("Collateral deposited");
    setCollateralEth("");
    void queryClient.invalidateQueries();
  }, [depositReceipt.isSuccess, depositCollateralTx.data, queryClient]);

  useEffect(() => {
    const hash = borrowTx.data;
    if (!borrowReceipt.isSuccess || !hash) return;
    if (processedBorrowHash.current === hash) return;
    processedBorrowHash.current = hash;
    toast.success("Borrow confirmed");
    setBorrowUsdt("");
    void queryClient.invalidateQueries();
  }, [borrowReceipt.isSuccess, borrowTx.data, queryClient]);

  useEffect(() => {
    const hash = approveTx.data;
    if (!approveReceipt.isSuccess || !hash) return;
    if (processedApproveHash.current === hash) return;
    processedApproveHash.current = hash;
    toast.success("USDT approval confirmed");
    void queryClient.invalidateQueries();
  }, [approveReceipt.isSuccess, approveTx.data, queryClient]);

  useEffect(() => {
    const hash = repayTx.data;
    if (!repayReceipt.isSuccess || !hash) return;
    if (processedRepayHash.current === hash) return;
    processedRepayHash.current = hash;
    toast.success("Repay confirmed");
    setRepayUsdt("");
    void queryClient.invalidateQueries();
  }, [repayReceipt.isSuccess, repayTx.data, queryClient]);

  useEffect(() => {
    const hash = withdrawTx.data;
    if (!withdrawReceipt.isSuccess || !hash) return;
    if (processedWithdrawHash.current === hash) return;
    processedWithdrawHash.current = hash;
    toast.success("Collateral withdraw confirmed");
    setWithdrawEth("");
    void queryClient.invalidateQueries();
  }, [withdrawReceipt.isSuccess, withdrawTx.data, queryClient]);
  useEffect(() => {
    if (depositCollateralTx.error) toast.error(depositCollateralTx.error.message);
  }, [depositCollateralTx.error]);
  useEffect(() => {
    if (borrowTx.error) toast.error(borrowTx.error.message);
  }, [borrowTx.error]);
  useEffect(() => {
    if (approveTx.error) toast.error(approveTx.error.message);
  }, [approveTx.error]);
  useEffect(() => {
    if (repayTx.error) toast.error(repayTx.error.message);
  }, [repayTx.error]);
  useEffect(() => {
    if (withdrawTx.error) toast.error(withdrawTx.error.message);
  }, [withdrawTx.error]);

  const parsedCollateral = useMemo(() => {
    try {
      return collateralEth.trim() ? parseEther(collateralEth.trim()) : null;
    } catch {
      return null;
    }
  }, [collateralEth]);
  const parsedBorrow = useMemo(() => {
    try {
      return borrowUsdt.trim() ? parseUnits(borrowUsdt.trim(), usdtDecimals) : null;
    } catch {
      return null;
    }
  }, [borrowUsdt, usdtDecimals]);
  const parsedRepay = useMemo(() => {
    try {
      return repayUsdt.trim() ? parseUnits(repayUsdt.trim(), usdtDecimals) : null;
    } catch {
      return null;
    }
  }, [repayUsdt, usdtDecimals]);
  const parsedWithdraw = useMemo(() => {
    try {
      return withdrawEth.trim() ? parseEther(withdrawEth.trim()) : null;
    } catch {
      return null;
    }
  }, [withdrawEth]);

  const ready = Boolean(isAddress(String(lendingPoolAddress)) && isAddress(String(usdtAddress)));
  const maxBorrow = maxBorrowRead.data as bigint | undefined;
  const borrowTooHigh = Boolean(parsedBorrow && maxBorrow != null && parsedBorrow > maxBorrow);
  const repayNeedsApprove =
    parsedRepay != null && (usdtAllowanceRead.data as bigint | undefined ?? 0n) < parsedRepay;
  const hf = hfLabel(hfRead.data as bigint | undefined);

  const hasPosition =
    (collateralRead.data as bigint | undefined ?? 0n) > 0n ||
    (debtRead.data as bigint | undefined ?? 0n) > 0n;

  return (
    <main className={shell}>
      <PageHeader
        title="Borrow"
        subtitle="Deposit ETH collateral, borrow USDT against it, and keep health factor above 1 to avoid liquidation."
      />

      {!mounted ? (
        <p className="text-sm text-slate-500">Loading wallet…</p>
      ) : !isConnected ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center">
          <p className="text-sm text-slate-400">Connect your wallet to manage a borrow position.</p>
          <div className="mt-4 flex justify-center">
            <WalletConnectButton />
          </div>
        </div>
      ) : null}

      <section className={`${card} mt-8`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-100">Your position</h2>
            {!hasPosition && isConnected ? (
              <p className="mt-2 text-sm text-slate-500">No collateral or debt yet — deposit ETH to open a position.</p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatTile label="Collateral (ETH)" value={fmt(collateralRead.data as bigint | undefined)} />
              <StatTile
                label="Debt (USDT)"
                value={fmt(debtValueRead.data as bigint | undefined, usdtDecimals)}
                hint="Includes accrued interest"
              />
              <StatTile label="Max borrow (USDT)" value={fmt(maxBorrow, usdtDecimals)} />
              <StatTile label="Collateral value (USDT)" value={fmt(collateralValueRead.data as bigint | undefined, usdtDecimals)} />
              <StatTile label="Wallet ETH" value={fmtWalletNativeEth(walletEthBalance)} />
              <StatTile label="Wallet USDT" value={fmt(usdtWalletRead.data as bigint | undefined, usdtDecimals)} />
            </div>
          </div>
          <div className="w-full shrink-0 lg:max-w-xs">
            <p className={label}>Health factor</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${hf.textClass}`}>{hf.text}</p>
            <div className="mt-4">
              <HealthFactorBar hf={hfRead.data as bigint | undefined} />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h3 className="text-base font-semibold text-slate-100">Deposit ETH collateral</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm text-slate-300">
              <span className={label}>Amount (ETH)</span>
              <input
                value={collateralEth}
                onChange={(e) => setCollateralEth(e.target.value)}
                placeholder="0.5"
                className={input}
              />
            </label>
            <button
              type="button"
              disabled={
                !isConnected || !ready || !parsedCollateral || depositCollateralTx.isPending || depositReceipt.isLoading
              }
              onClick={() =>
                depositCollateralTx.writeContract({
                  abi: LendingPool_ABI,
                  address: lendingPoolAddress!,
                  functionName: "depositCollateral",
                  value: parsedCollateral!,
                })
              }
              className={btnPrimary}
            >
              {depositCollateralTx.isPending || depositReceipt.isLoading ? "Depositing…" : "Deposit"}
            </button>
          </div>
        </section>

        <section className={card}>
          <h3 className="text-base font-semibold text-slate-100">Borrow USDT</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm text-slate-300">
              <span className={label}>Amount</span>
              <input
                value={borrowUsdt}
                onChange={(e) => setBorrowUsdt(e.target.value)}
                placeholder="100"
                className={input}
              />
            </label>
            <button
              type="button"
              disabled={
                !isConnected || !ready || !parsedBorrow || borrowTooHigh || borrowTx.isPending || borrowReceipt.isLoading
              }
              onClick={() =>
                borrowTx.writeContract({
                  abi: LendingPool_ABI,
                  address: lendingPoolAddress!,
                  functionName: "borrow",
                  args: [parsedBorrow!],
                })
              }
              className={btnPrimary}
            >
              {borrowTx.isPending || borrowReceipt.isLoading ? "Borrowing…" : "Borrow"}
            </button>
          </div>
          {borrowTooHigh ? <p className="mt-2 text-sm text-red-400">Amount exceeds max borrow.</p> : null}
        </section>

        <section className={card}>
          <h3 className="text-base font-semibold text-slate-100">Repay USDT</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm text-slate-300">
              <span className={label}>Amount</span>
              <input
                value={repayUsdt}
                onChange={(e) => setRepayUsdt(e.target.value)}
                placeholder="50"
                className={input}
              />
            </label>
            {repayNeedsApprove ? (
              <button
                type="button"
                disabled={!isConnected || !ready || !parsedRepay || approveTx.isPending || approveReceipt.isLoading}
                onClick={() =>
                  approveTx.writeContract({
                    abi: MockUSDT_ABI,
                    address: usdtAddress!,
                    functionName: "approve",
                    args: [lendingPoolAddress!, parsedRepay!],
                  })
                }
                className={btnNeutral}
              >
                {approveTx.isPending || approveReceipt.isLoading ? "Approving…" : "Approve"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!isConnected || !ready || !parsedRepay || repayTx.isPending || repayReceipt.isLoading}
                onClick={() =>
                  repayTx.writeContract({
                    abi: LendingPool_ABI,
                    address: lendingPoolAddress!,
                    functionName: "repay",
                    args: [parsedRepay!],
                  })
                }
                className={btnPrimary}
              >
                {repayTx.isPending || repayReceipt.isLoading ? "Repaying…" : "Repay"}
              </button>
            )}
          </div>
        </section>

        <section className={card}>
          <h3 className="text-base font-semibold text-slate-100">Withdraw ETH collateral</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm text-slate-300">
              <span className={label}>Amount (ETH)</span>
              <input
                value={withdrawEth}
                onChange={(e) => setWithdrawEth(e.target.value)}
                placeholder="0.1"
                className={input}
              />
            </label>
            <button
              type="button"
              disabled={!isConnected || !ready || !parsedWithdraw || withdrawTx.isPending || withdrawReceipt.isLoading}
              onClick={() =>
                withdrawTx.writeContract({
                  abi: LendingPool_ABI,
                  address: lendingPoolAddress!,
                  functionName: "withdrawCollateral",
                  args: [parsedWithdraw!],
                })
              }
              className={btnPrimary}
            >
              {withdrawTx.isPending || withdrawReceipt.isLoading ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
        </section>
      </div>

      {depositCollateralTx.error ? (
        <p className="mt-4 text-sm text-red-400">{depositCollateralTx.error.message}</p>
      ) : null}
      {borrowTx.error ? <p className="mt-2 text-sm text-red-400">{borrowTx.error.message}</p> : null}
      {approveTx.error ? <p className="mt-2 text-sm text-red-400">{approveTx.error.message}</p> : null}
      {repayTx.error ? <p className="mt-2 text-sm text-red-400">{repayTx.error.message}</p> : null}
      {withdrawTx.error ? <p className="mt-2 text-sm text-red-400">{withdrawTx.error.message}</p> : null}

      {!ready ? (
        <p className="mt-8 text-sm text-red-400">
          Set <code className={code}>NEXT_PUBLIC_LENDING_POOL_ADDRESS</code> and{" "}
          <code className={code}>NEXT_PUBLIC_MOCK_USDT_ADDRESS</code>.
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/pool" className="text-cyan-400/90 hover:text-cyan-300">
          ← Pool
        </Link>
        <Link href="/dashboard" className="text-cyan-400/90 hover:text-cyan-300">
          Dashboard →
        </Link>
      </div>
    </main>
  );
}
