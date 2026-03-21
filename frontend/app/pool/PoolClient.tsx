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

import { FRToken_ABI, LendingPool_ABI, MockUSDT_ABI } from "@/lib/abi";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtAddress = process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined;
const frTokenAddress = process.env.NEXT_PUBLIC_FRTOKEN_ADDRESS as `0x${string}` | undefined;

function fmtToken(value?: bigint, digits = 4) {
  if (value == null) return "-";
  return Number(formatUnits(value, 18)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPct(bps?: bigint) {
  if (bps == null) return "-";
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

export function PoolClient() {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawFrAmount, setWithdrawFrAmount] = useState("");
  const [mounted, setMounted] = useState(false);

  const { address, isConnected } = useAccount();

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
    if (approveReceipt.isSuccess) toast.success("USDT approval confirmed");
  }, [approveReceipt.isSuccess]);
  useEffect(() => {
    if (depositReceipt.isSuccess) toast.success("Deposit confirmed");
  }, [depositReceipt.isSuccess]);
  useEffect(() => {
    if (withdrawReceipt.isSuccess) toast.success("Withdraw confirmed");
  }, [withdrawReceipt.isSuccess]);
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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Lender pool</h1>
      <p className="mt-2 text-sm text-neutral-600">Approve MockUSDT, deposit into pool, and withdraw with FR shares.</p>

      <div className="mt-4 rounded border border-neutral-200 p-4 text-sm">
        <p>
          LendingPool: <code className="rounded bg-neutral-100 px-1">{lendingPoolAddress || "missing env"}</code>
        </p>
        <p>
          MockUSDT: <code className="rounded bg-neutral-100 px-1">{usdtAddress || "missing env"}</code>
        </p>
        <p>
          FRToken: <code className="rounded bg-neutral-100 px-1">{frTokenAddress || "missing env"}</code>
        </p>
      </div>

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

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h2 className="font-medium">Protocol stats</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <p>Available liquidity: {fmtToken(availableLiquidity.data as bigint | undefined)}</p>
          <p>Total supplied: {fmtToken(totalSupplied.data as bigint | undefined)}</p>
          <p>Total borrowed: {fmtToken(totalBorrowed.data as bigint | undefined)}</p>
          <p>Utilization: {fmtPct(utilization.data as bigint | undefined)}</p>
          <p>Supply APY: {fmtPct(supplyApy.data as bigint | undefined)}</p>
          <p>Borrow APY: {fmtPct(borrowApy.data as bigint | undefined)}</p>
        </div>
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h2 className="font-medium">Your balances</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <p>USDT: {fmtToken(usdtBalance.data as bigint | undefined)}</p>
          <p>FR: {fmtToken(frBalance.data as bigint | undefined)}</p>
          <p>Allowance to pool: {fmtToken(allowance.data as bigint | undefined)}</p>
        </div>
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h2 className="font-medium">Deposit USDT</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            Amount (USDT)
            <input
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="100"
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
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {isApprovePending || approveReceipt.isLoading ? "Approving..." : "Approve USDT"}
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
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {isDepositPending || depositReceipt.isLoading ? "Depositing..." : "Deposit"}
            </button>
          )}
        </div>
        {approveError ? <p className="mt-2 text-sm text-red-600">{approveError.message}</p> : null}
        {depositError ? <p className="mt-2 text-sm text-red-600">{depositError.message}</p> : null}
      </section>

      <section className="mt-6 rounded border border-neutral-200 p-4">
        <h2 className="font-medium">Withdraw by FR amount</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            FR amount
            <input
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
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
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {isWithdrawPending || withdrawReceipt.isLoading ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>
        {withdrawError ? <p className="mt-2 text-sm text-red-600">{withdrawError.message}</p> : null}
      </section>

      {!ready ? (
        <p className="mt-6 text-sm text-red-600">
          Missing or invalid contract env addresses. Set `NEXT_PUBLIC_LENDING_POOL_ADDRESS`,
          `NEXT_PUBLIC_MOCK_USDT_ADDRESS`, and `NEXT_PUBLIC_FRTOKEN_ADDRESS` in `frontend/.env`.
        </p>
      ) : null}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/" className="text-blue-600 underline">
          Home
        </Link>
        <Link href="/admin" className="text-blue-600 underline">
          Admin
        </Link>
      </div>
    </main>
  );
}
