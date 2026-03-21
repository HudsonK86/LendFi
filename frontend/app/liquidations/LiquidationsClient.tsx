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

import { LendingPool_ABI, MockUSDT_ABI } from "@/lib/abi";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtAddress = process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined;

function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "-";
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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Liquidations</h1>
      <p className="mt-2 text-sm text-neutral-600">Liquidate borrower positions when health factor is below 1.</p>

      {!mounted ? (
        <p className="mt-6 text-sm text-neutral-500">Loading wallet...</p>
      ) : !isConnected ? (
        <div className="mt-6">
          <WalletConnectButton />
        </div>
      ) : (
        <p className="mt-6 text-sm text-neutral-700">
          Connected liquidator: <code className="rounded bg-neutral-100 px-1">{address}</code>
        </p>
      )}

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <label className="text-sm">
          Borrower address
          <input
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="0x..."
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        {!borrowerAddress && borrower.trim() ? (
          <p className="mt-2 text-sm text-red-600">Enter a valid EVM address.</p>
        ) : null}
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4 text-sm">
        <h2 className="font-medium">Borrower status</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <p>
            Health factor:{" "}
            <span className={hf != null && hf < 10n ** 18n ? "text-red-600" : "text-green-700"}>
              {hf == null ? "-" : Number(formatUnits(hf, 18)).toFixed(3)}
            </span>
          </p>
          <p>Debt USDT: {fmt(debtRead.data as bigint | undefined, usdtDecimals)}</p>
          <p>Collateral ETH: {fmt(collateralRead.data as bigint | undefined, 18)}</p>
        </div>
        {hf != null ? (
          <p className="mt-2 text-sm">
            {isLiquidatable ? "Position is liquidatable (HF < 1)." : "Not liquidatable (HF >= 1)."}
          </p>
        ) : null}
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h2 className="font-medium">Liquidate</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            Repay amount (USDT)
            <input
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder="50"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
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
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {approveTx.isPending || approveReceipt.isLoading ? "Approving..." : "Approve USDT"}
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
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {liquidateTx.isPending || liquidateReceipt.isLoading ? "Liquidating..." : "Liquidate"}
            </button>
          )}
        </div>
      </section>

      {approveTx.error ? <p className="mt-3 text-sm text-red-600">{approveTx.error.message}</p> : null}
      {liquidateTx.error ? <p className="mt-3 text-sm text-red-600">{liquidateTx.error.message}</p> : null}

      {!ready ? (
        <p className="mt-6 text-sm text-red-600">
          Missing or invalid env addresses for `NEXT_PUBLIC_LENDING_POOL_ADDRESS` and `NEXT_PUBLIC_MOCK_USDT_ADDRESS`.
        </p>
      ) : null}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/" className="text-blue-600 underline">
          Home
        </Link>
        <Link href="/borrow" className="text-blue-600 underline">
          Borrow
        </Link>
      </div>
    </main>
  );
}
