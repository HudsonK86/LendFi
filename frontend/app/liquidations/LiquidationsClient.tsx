"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { formatUnits, isAddress, parseUnits } from "viem";
import {
  useAccount,
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
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function LiquidationsClient() {
  const [mounted, setMounted] = useState(false);
  const [borrower, setBorrower] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  const { address, isConnected } = useAccount();

  useEffect(() => setMounted(true), []);

  const usdtDecimalsRead = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "decimals",
    query: { enabled: Boolean(usdtAddress) },
  });
  const usdtDecimals = Number(usdtDecimalsRead.data ?? 18);

  const borrowerAddress = useMemo(
    () => (isAddress(borrower.trim()) ? (borrower.trim() as `0x${string}`) : undefined),
    [borrower],
  );

  const hfRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getHealthFactor",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });
  const debtRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "debtUSDT",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });
  const collateralRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "collateralETH",
    args: borrowerAddress ? [borrowerAddress] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && borrowerAddress) },
  });

  const allowanceRead = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "allowance",
    args: address && lendingPoolAddress ? [address, lendingPoolAddress] : undefined,
    query: { enabled: Boolean(address && usdtAddress && lendingPoolAddress) },
  });

  const parsedRepay = useMemo(() => {
    try {
      return repayAmount.trim() ? parseUnits(repayAmount.trim(), usdtDecimals) : null;
    } catch {
      return null;
    }
  }, [repayAmount, usdtDecimals]);

  const hf = hfRead.data as bigint | undefined;
  const isLiquidatable = hf != null && hf < 10n ** 18n;
  const needsApprove = parsedRepay != null && (allowanceRead.data as bigint | undefined ?? 0n) < parsedRepay;

  const approveTx = useWriteContract();
  const liquidateTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const liquidateReceipt = useWaitForTransactionReceipt({ hash: liquidateTx.data });
  useEffect(() => {
    if (approveReceipt.isSuccess) toast.success("USDT approval confirmed");
  }, [approveReceipt.isSuccess]);
  useEffect(() => {
    if (liquidateReceipt.isSuccess) toast.success("Liquidation confirmed");
  }, [liquidateReceipt.isSuccess]);
  useEffect(() => {
    if (approveTx.error) toast.error(approveTx.error.message);
  }, [approveTx.error]);
  useEffect(() => {
    if (liquidateTx.error) toast.error(liquidateTx.error.message);
  }, [liquidateTx.error]);

  const ready = Boolean(isAddress(String(lendingPoolAddress)) && isAddress(String(usdtAddress)));

  const hfNum = hf == null ? null : Number(formatUnits(hf, 18));

  return (
    <main className={shell}>
      <PageHeader
        title="Liquidations"
        subtitle="Repay a borrower’s debt when their health factor is below 1 and receive collateral (+ liquidation incentive) per pool rules."
      />

      {!mounted ? (
        <p className="mt-6 text-sm text-slate-500">Loading wallet…</p>
      ) : !isConnected ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center">
          <p className="text-sm text-slate-400">Connect a wallet to liquidate positions.</p>
          <div className="mt-4 flex justify-center">
            <WalletConnectButton />
          </div>
        </div>
      ) : null}

      <section className={`${card} mt-8`}>
        <label className="text-sm text-slate-300">
          <span className={label}>Borrower address</span>
          <input
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="0x…"
            className={input}
          />
        </label>
        {!borrowerAddress && borrower.trim() ? (
          <p className="mt-2 text-sm text-red-400">Enter a valid EVM address.</p>
        ) : null}
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-base font-semibold text-slate-100">Borrower status</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Health factor"
            value={hfNum == null ? "—" : hfNum.toFixed(3)}
            hint={hf != null && hf < 10n ** 18n ? "Below 1 — liquidatable" : "At or above 1"}
          />
          <StatTile label="Debt (USDT)" value={fmt(debtRead.data as bigint | undefined, usdtDecimals)} />
          <StatTile label="Collateral (ETH)" value={fmt(collateralRead.data as bigint | undefined, 18)} />
        </div>
        {hf != null ? (
          <p
            className={`mt-4 text-sm font-medium ${isLiquidatable ? "text-red-400" : "text-emerald-400/90"}`}
          >
            {isLiquidatable ? "Position is liquidatable (HF < 1)." : "Not liquidatable (HF ≥ 1)."}
          </p>
        ) : null}
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-base font-semibold text-slate-100">Liquidate</h2>
        <p className="mt-1 text-xs text-slate-500">Approve USDT if needed, then call liquidate.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm text-slate-300">
            <span className={label}>Repay amount (USDT)</span>
            <input
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder="50"
              className={input}
            />
          </label>
          {needsApprove ? (
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
              {approveTx.isPending || approveReceipt.isLoading ? "Approving…" : "Approve USDT"}
            </button>
          ) : (
            <button
              type="button"
              disabled={
                !isConnected ||
                !ready ||
                !borrowerAddress ||
                !parsedRepay ||
                !isLiquidatable ||
                liquidateTx.isPending ||
                liquidateReceipt.isLoading
              }
              onClick={() =>
                liquidateTx.writeContract({
                  abi: LendingPool_ABI,
                  address: lendingPoolAddress!,
                  functionName: "liquidate",
                  args: [borrowerAddress!, parsedRepay!],
                })
              }
              className={btnPrimary}
            >
              {liquidateTx.isPending || liquidateReceipt.isLoading ? "Liquidating…" : "Liquidate"}
            </button>
          )}
        </div>
      </section>

      {approveTx.error ? <p className="mt-3 text-sm text-red-400">{approveTx.error.message}</p> : null}
      {liquidateTx.error ? <p className="mt-3 text-sm text-red-400">{liquidateTx.error.message}</p> : null}

      {!ready ? (
        <p className="mt-8 text-sm text-red-400">
          Set <code className={code}>NEXT_PUBLIC_LENDING_POOL_ADDRESS</code> and{" "}
          <code className={code}>NEXT_PUBLIC_MOCK_USDT_ADDRESS</code>.
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/borrow" className="text-cyan-400/90 hover:text-cyan-300">
          ← Borrow
        </Link>
        <Link href="/dashboard" className="text-cyan-400/90 hover:text-cyan-300">
          Dashboard →
        </Link>
      </div>
    </main>
  );
}
