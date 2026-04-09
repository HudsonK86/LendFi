"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { isAddress, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { LendingPool_ABI, MockUSDT_ABI } from "@/lib/abi";
import { getLiquidationScanAddresses } from "@/lib/liquidation-scan-addresses";
import { btnNeutral, btnPrimary, card, input, label } from "@/lib/ui";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtAddress = process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined;

type MulticallRow = { status: "success" | "failure"; result?: unknown };

function asBigint(row: MulticallRow | undefined): bigint | undefined {
  if (!row || row.status !== "success") return undefined;
  const r = row.result;
  return typeof r === "bigint" ? r : undefined;
}

type LiquidationPanelProps = {
  /** Extra class for the outer section (default: card shell) */
  className?: string;
  compact?: boolean;
  hideDescription?: boolean;
};

export function LiquidationPanel({
  className = card,
  compact = false,
  hideDescription = false,
}: LiquidationPanelProps) {
  const [repayAmount, setRepayAmount] = useState("");
  const queryClient = useQueryClient();
  const processedApproveHash = useRef<`0x${string}` | undefined>(undefined);
  const processedLiquidateHash = useRef<`0x${string}` | undefined>(undefined);

  const { address, isConnected } = useAccount();

  const scanAddresses = useMemo(() => getLiquidationScanAddresses(), []);

  const usdtDecimalsRead = useReadContract({
    abi: MockUSDT_ABI,
    address: usdtAddress,
    functionName: "decimals",
    query: { enabled: Boolean(usdtAddress) },
  });
  const usdtDecimals = Number(usdtDecimalsRead.data ?? 18);

  const scanContracts = useMemo(
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

  const scanRead = useReadContracts({
    contracts: scanContracts,
    query: {
      enabled: Boolean(lendingPoolAddress && scanContracts.length > 0),
      staleTime: 12_000,
    },
  });

  const eligibleRows = useMemo(() => {
    const scanData = scanRead.data;
    if (!scanData?.length || !scanAddresses.length) return [];
    const rows: { address: `0x${string}`; hf: bigint; debt: bigint; coll: bigint }[] = [];
    for (let i = 0; i < scanAddresses.length; i++) {
      const base = i * 3;
      const hfVal = asBigint(scanData[base] as MulticallRow);
      const debtVal = asBigint(scanData[base + 1] as MulticallRow);
      const collVal = asBigint(scanData[base + 2] as MulticallRow);
      if (hfVal == null || debtVal == null || collVal == null) continue;
      if (debtVal === 0n) continue;
      if (hfVal >= 10n ** 18n) continue;
      rows.push({ address: scanAddresses[i], hf: hfVal, debt: debtVal, coll: collVal });
    }
    return rows.sort((a, b) => (a.hf < b.hf ? -1 : a.hf > b.hf ? 1 : 0));
  }, [scanRead.data, scanAddresses]);

  const liquidationTarget = eligibleRows[0]?.address;

  const hfRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getHealthFactor",
    args: liquidationTarget ? [liquidationTarget] : undefined,
    query: { enabled: Boolean(lendingPoolAddress && liquidationTarget) },
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
    const hash = approveTx.data;
    if (!approveReceipt.isSuccess || !hash) return;
    if (processedApproveHash.current === hash) return;
    processedApproveHash.current = hash;
    toast.success("USDT approval confirmed");
    void queryClient.invalidateQueries();
  }, [approveReceipt.isSuccess, approveTx.data, queryClient]);

  useEffect(() => {
    const hash = liquidateTx.data;
    if (!liquidateReceipt.isSuccess || !hash) return;
    if (processedLiquidateHash.current === hash) return;
    processedLiquidateHash.current = hash;
    toast.success("Liquidation confirmed");
    setRepayAmount("");
    void scanRead.refetch();
    void queryClient.invalidateQueries();
  }, [liquidateReceipt.isSuccess, liquidateTx.data, queryClient, scanRead]);
  useEffect(() => {
    if (approveTx.error) toast.error(approveTx.error.message);
  }, [approveTx.error]);
  useEffect(() => {
    if (liquidateTx.error) toast.error(liquidateTx.error.message);
  }, [liquidateTx.error]);

  const ready = Boolean(isAddress(String(lendingPoolAddress)) && isAddress(String(usdtAddress)));
  const poolConfigured = Boolean(lendingPoolAddress && isAddress(String(lendingPoolAddress)));

  const scanLoading = poolConfigured && scanRead.isPending && !scanRead.data;
  const noLiquidatable = poolConfigured && !scanLoading && Boolean(scanRead.data) && eligibleRows.length === 0;

  return (
    <section className={className}>
      {!compact ? <h2 className="text-base font-semibold text-slate-100">Liquidate</h2> : null}
      {!hideDescription ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Repay underwater debt with your USDT; ETH from collateral (plus liquidation bonus) is sent to your wallet.
        </p>
      ) : null}

      {poolConfigured ? (
        scanLoading || noLiquidatable ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {scanLoading ? <span>Checking positions…</span> : null}
            {noLiquidatable ? <span>Nothing to liquidate right now.</span> : null}
          </div>
        ) : null
      ) : (
        <p className="mt-3 text-sm text-amber-400/90">Configure the lending pool in the app settings.</p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-slate-300">
          <span className={label}>Amount (USDT)</span>
          <input
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            placeholder="50"
            className={input}
            disabled={!isConnected}
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
              !liquidationTarget ||
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
                args: [liquidationTarget!, parsedRepay!],
              })
            }
            className={btnPrimary}
          >
            {liquidateTx.isPending || liquidateReceipt.isLoading ? "Liquidating…" : "Liquidate"}
          </button>
        )}
      </div>

    </section>
  );
}
