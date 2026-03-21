"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { formatUnits, isAddress, parseEther, parseUnits } from "viem";
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

function hfLabel(hf?: bigint) {
  if (hf == null) return { text: "-", cls: "text-neutral-600" };
  const n = Number(formatUnits(hf, 18));
  if (n < 1) return { text: n.toFixed(3), cls: "text-red-600" };
  if (n < 1.25) return { text: n.toFixed(3), cls: "text-amber-600" };
  return { text: n.toFixed(3), cls: "text-green-700" };
}

export function BorrowClient() {
  const [mounted, setMounted] = useState(false);
  const [collateralEth, setCollateralEth] = useState("");
  const [borrowUsdt, setBorrowUsdt] = useState("");
  const [repayUsdt, setRepayUsdt] = useState("");
  const [withdrawEth, setWithdrawEth] = useState("");

  const { address, isConnected } = useAccount();

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
    if (depositReceipt.isSuccess) toast.success("Collateral deposited");
  }, [depositReceipt.isSuccess]);
  useEffect(() => {
    if (borrowReceipt.isSuccess) toast.success("Borrow confirmed");
  }, [borrowReceipt.isSuccess]);
  useEffect(() => {
    if (approveReceipt.isSuccess) toast.success("USDT approval confirmed");
  }, [approveReceipt.isSuccess]);
  useEffect(() => {
    if (repayReceipt.isSuccess) toast.success("Repay confirmed");
  }, [repayReceipt.isSuccess]);
  useEffect(() => {
    if (withdrawReceipt.isSuccess) toast.success("Collateral withdraw confirmed");
  }, [withdrawReceipt.isSuccess]);
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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Borrower position</h1>
      <p className="mt-2 text-sm text-neutral-600">Manage collateral, borrow USDT, repay debt, and withdraw collateral.</p>

      {!mounted ? (
        <p className="mt-6 text-sm text-neutral-500">Loading wallet...</p>
      ) : !isConnected ? (
        <div className="mt-6">
          <WalletConnectButton />
        </div>
      ) : (
        <p className="mt-6 text-sm text-neutral-700">
          Connected: <code className="rounded bg-neutral-100 px-1">{address}</code>
        </p>
      )}

      <section className="mt-6 rounded border border-neutral-200 p-4 text-sm">
        <h2 className="font-medium">Position</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <p>Collateral ETH: {fmt(collateralRead.data as bigint | undefined)}</p>
          <p>Debt USDT: {fmt(debtRead.data as bigint | undefined, usdtDecimals)}</p>
          <p>
            Health factor: <span className={hf.cls}>{hf.text}</span>
          </p>
          <p>Max borrow USDT: {fmt(maxBorrow, usdtDecimals)}</p>
          <p>Collateral value: {fmt(collateralValueRead.data as bigint | undefined, usdtDecimals)}</p>
          <p>Debt value: {fmt(debtValueRead.data as bigint | undefined, usdtDecimals)}</p>
          <p>Wallet USDT: {fmt(usdtWalletRead.data as bigint | undefined, usdtDecimals)}</p>
          <p>Repay allowance: {fmt(usdtAllowanceRead.data as bigint | undefined, usdtDecimals)}</p>
        </div>
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Deposit ETH collateral</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            ETH amount
            <input
              value={collateralEth}
              onChange={(e) => setCollateralEth(e.target.value)}
              placeholder="0.5"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={!isConnected || !ready || !parsedCollateral || depositCollateralTx.isPending || depositReceipt.isLoading}
            onClick={() =>
              depositCollateralTx.writeContract({
                abi: LendingPool_ABI,
                address: lendingPoolAddress!,
                functionName: "depositCollateral",
                value: parsedCollateral!,
              })
            }
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {depositCollateralTx.isPending || depositReceipt.isLoading ? "Depositing..." : "Deposit collateral"}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Borrow USDT</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            USDT amount
            <input
              value={borrowUsdt}
              onChange={(e) => setBorrowUsdt(e.target.value)}
              placeholder="100"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={!isConnected || !ready || !parsedBorrow || borrowTooHigh || borrowTx.isPending || borrowReceipt.isLoading}
            onClick={() =>
              borrowTx.writeContract({
                abi: LendingPool_ABI,
                address: lendingPoolAddress!,
                functionName: "borrow",
                args: [parsedBorrow!],
              })
            }
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {borrowTx.isPending || borrowReceipt.isLoading ? "Borrowing..." : "Borrow"}
          </button>
        </div>
        {borrowTooHigh ? <p className="mt-2 text-sm text-red-600">Borrow amount exceeds max borrow.</p> : null}
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Repay USDT</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            USDT amount
            <input
              value={repayUsdt}
              onChange={(e) => setRepayUsdt(e.target.value)}
              placeholder="50"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
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
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {approveTx.isPending || approveReceipt.isLoading ? "Approving..." : "Approve USDT"}
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
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {repayTx.isPending || repayReceipt.isLoading ? "Repaying..." : "Repay"}
            </button>
          )}
        </div>
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Withdraw ETH collateral</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            ETH amount
            <input
              value={withdrawEth}
              onChange={(e) => setWithdrawEth(e.target.value)}
              placeholder="0.1"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
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
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {withdrawTx.isPending || withdrawReceipt.isLoading ? "Withdrawing..." : "Withdraw collateral"}
          </button>
        </div>
      </section>

      {depositCollateralTx.error ? <p className="mt-3 text-sm text-red-600">{depositCollateralTx.error.message}</p> : null}
      {borrowTx.error ? <p className="mt-3 text-sm text-red-600">{borrowTx.error.message}</p> : null}
      {approveTx.error ? <p className="mt-3 text-sm text-red-600">{approveTx.error.message}</p> : null}
      {repayTx.error ? <p className="mt-3 text-sm text-red-600">{repayTx.error.message}</p> : null}
      {withdrawTx.error ? <p className="mt-3 text-sm text-red-600">{withdrawTx.error.message}</p> : null}

      {!ready ? (
        <p className="mt-6 text-sm text-red-600">
          Missing or invalid contract env addresses. Set `NEXT_PUBLIC_LENDING_POOL_ADDRESS` and
          `NEXT_PUBLIC_MOCK_USDT_ADDRESS`.
        </p>
      ) : null}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/" className="text-blue-600 underline">
          Home
        </Link>
        <Link href="/pool" className="text-blue-600 underline">
          Pool
        </Link>
      </div>
    </main>
  );
}
