"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { formatUnits, isAddress, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { PageHeader } from "@/components/PageHeader";
import { LendingPool_ABI, MockUSDT_ABI } from "@/lib/abi";
import { getLiquidationScanAddresses } from "@/lib/liquidation-scan-addresses";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { StatTile } from "@/components/StatTile";
import { btnNeutral, btnPrimary, card, code, input, label, shell } from "@/lib/ui";

const lendingPoolAddress = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined;
const usdtAddress = process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined;

function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

type MulticallRow = { status: "success" | "failure"; result?: unknown };

function asBigint(row: MulticallRow | undefined): bigint | undefined {
  if (!row || row.status !== "success") return undefined;
  const r = row.result;
  return typeof r === "bigint" ? r : undefined;
}

export function LiquidationsClient() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [borrower, setBorrower] = useState("");
  /** True: user chose URL, manual address, or Advanced table—do not overwrite with auto-pick. */
  const [borrowerOverride, setBorrowerOverride] = useState(false);
  /** When false, a valid borrower shows as read-only. When true, show the text field. */
  const [manualBorrowerOpen, setManualBorrowerOpen] = useState(false);
  /** Collapsed by default: full scan table for power users. */
  const [showAdvancedScan, setShowAdvancedScan] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");

  const { address, isConnected } = useAccount();

  const scanAddresses = useMemo(() => getLiquidationScanAddresses(), []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const b = searchParams.get("borrower");
    if (b && isAddress(b)) {
      setBorrower(b);
      setManualBorrowerOpen(false);
    }
  }, [searchParams]);

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
    // Highest HF first among HF < 1 (closest to 1 / “least underwater” in this scan).
    return rows.sort((a, b) => (a.hf > b.hf ? -1 : a.hf < b.hf ? 1 : 0));
  }, [scanRead.data, scanAddresses]);

  const autoSelectedRow = useMemo(() => eligibleRows[0], [eligibleRows]);
  const autoBorrowerAddress = autoSelectedRow?.address;

  useEffect(() => {
    if (borrowerOverride) return;
    if (autoBorrowerAddress) setBorrower(autoBorrowerAddress);
    else setBorrower("");
  }, [borrowerOverride, autoBorrowerAddress]);

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
  const refetchScanLiquidations = scanRead.refetch;
  useEffect(() => {
    if (liquidateReceipt.isSuccess) {
      toast.success("Liquidation confirmed");
      void refetchScanLiquidations();
    }
  }, [liquidateReceipt.isSuccess, refetchScanLiquidations]);
  useEffect(() => {
    if (approveTx.error) toast.error(approveTx.error.message);
  }, [approveTx.error]);
  useEffect(() => {
    if (liquidateTx.error) toast.error(liquidateTx.error.message);
  }, [liquidateTx.error]);

  const ready = Boolean(isAddress(String(lendingPoolAddress)) && isAddress(String(usdtAddress)));
  const poolConfigured = Boolean(lendingPoolAddress && isAddress(String(lendingPoolAddress)));
  const hasCustomScanList = Boolean(process.env.NEXT_PUBLIC_LIQUIDATION_CANDIDATES?.trim());

  const hfNum = hf == null ? null : Number(formatUnits(hf, 18));

  const scanLoading = poolConfigured && scanRead.isPending && !scanRead.data;
  const noLiquidatableInScan =
    poolConfigured && !scanLoading && Boolean(scanRead.data) && eligibleRows.length === 0;
  const usingAutoTarget = Boolean(autoBorrowerAddress) && !borrowerOverride;

  return (
    <main className={shell}>
      <PageHeader
        title="Liquidations"
        subtitle="Help close risky loans: pay someone’s debt with your USDT and receive ETH from their collateral, plus a protocol bonus."
      />

      <section
        className="mt-8 rounded-xl border border-slate-800/90 bg-slate-950/60 p-5 text-sm leading-relaxed text-slate-300"
        aria-labelledby="liquidations-plain-heading"
      >
        <h2 id="liquidations-plain-heading" className="text-base font-semibold text-slate-100">
          How this works (plain English)
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong className="text-slate-200">Who does what:</strong> You connect <em>your</em> wallet as the{" "}
            <strong className="text-slate-200">liquidator</strong>. You send a transaction to the{" "}
            <strong className="text-slate-200">LendFi pool contract</strong>. Your USDT pays down a{" "}
            <em>specific borrower’s</em> debt; the contract sends you ETH from <em>that borrower’s</em>{" "}
            collateral, with a small extra (this pool uses a <strong className="text-slate-200">5% liquidation bonus</strong> on
            the collateral side—see protocol docs for details).
          </li>
          <li>
            <strong className="text-slate-200">Why a borrower address exists:</strong> The pool doesn’t have one big “debt
            pile.” It stores <em>separate</em> loans per wallet. The contract must know <strong className="text-slate-200">
            which loan</strong> you’re fixing. The app usually <strong className="text-slate-200">picks</strong> that address
            for you from the scan (or you override). The borrower doesn’t sign; the math happens in the pool using your
            USDT and their collateral.
          </li>
          <li>
            <strong className="text-slate-200">What you’ll do here:</strong> Enter how much USDT to repay → approve if
            asked → click Liquidate. The app <strong className="text-slate-200">picks a borrower</strong> from the scan
            list automatically (highest health factor under 1 first—see Advanced). You can override with a link, manual
            address, or the optional table. Funds move between <strong className="text-slate-200">your wallet</strong> and
            the pool contract.
          </li>
          <li>
            <strong className="text-slate-200">About the scan:</strong> The blockchain doesn’t list every borrower. We
            scan a fixed set of addresses (default: Hardhat test accounts, or{" "}
            <code className={code}>NEXT_PUBLIC_LIQUIDATION_CANDIDATES</code>). Positions with debt and HF &lt; 1 are
            candidates; the app targets the <strong className="text-slate-200">highest HF among them</strong> unless you
            override.
          </li>
        </ul>
      </section>

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
        <h2 className="text-base font-semibold text-slate-100">Liquidate</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Enter how much USDT you want to use. The pool contract will take your USDT, pay down the target loan, and send
          you ETH from that borrower’s collateral (plus the 5% liquidation bonus on the seized collateral in this
          deployment). The <strong className="text-slate-400">borrower address</strong> is chosen for you from the scan
          (highest health factor under 1 first) unless you override.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3 text-xs text-slate-500">
          <span>
            {poolConfigured
              ? scanLoading
                ? "Scanning candidates…"
                : `${eligibleRows.length} liquidatable in scan`
              : "Pool not configured"}
          </span>
          <button
            type="button"
            onClick={() => void scanRead.refetch()}
            disabled={!poolConfigured || scanRead.isFetching}
            className={btnNeutral}
          >
            {scanRead.isFetching ? "Refreshing…" : "Refresh scan"}
          </button>
          <button
            type="button"
            className="text-cyan-400/90 hover:text-cyan-300"
            onClick={() => setShowAdvancedScan((s) => !s)}
          >
            {showAdvancedScan ? "Hide" : "Show"} all liquidatable (Advanced)
          </button>
        </div>

        {!poolConfigured ? (
          <p className="mt-3 text-sm text-amber-400/90">Set NEXT_PUBLIC_LENDING_POOL_ADDRESS to run the scan.</p>
        ) : null}
        {scanLoading ? (
          <p className="mt-3 text-sm text-slate-500">Scanning candidate addresses for underwater loans…</p>
        ) : null}
        {noLiquidatableInScan && !borrowerOverride ? (
          <p className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-200/90">
            No liquidatable positions in the current candidate list (need debt and HF &lt; 1). You can still{" "}
            <button
              type="button"
              className="font-medium text-cyan-400/90 underline hover:text-cyan-300"
              onClick={() => setManualBorrowerOpen(true)}
            >
              enter a borrower address manually
            </button>{" "}
            if you know one, or expand candidates in env.
          </p>
        ) : null}

        <h3 className="mt-6 text-sm font-semibold text-slate-200">Target loan (borrower)</h3>
        <p className="mt-1 text-xs text-slate-500">
          {usingAutoTarget
            ? "Auto-selected: highest HF under 1 in this scan (closest to healthy)."
            : borrowerOverride
              ? "Custom target — you set this via link, manual entry, or Advanced table."
              : "No automatic target yet."}
        </p>

        {borrowerAddress && !manualBorrowerOpen ? (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {usingAutoTarget ? "Auto-selected borrower" : "Borrower address (on-chain loan)"}
            </p>
            <p className="mt-2 break-all font-mono text-sm text-cyan-200/95">{borrowerAddress}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnNeutral}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(borrowerAddress);
                    toast.success("Address copied");
                  } catch {
                    toast.error("Could not copy");
                  }
                }}
              >
                Copy address
              </button>
              <button
                type="button"
                className={btnNeutral}
                onClick={() => {
                  setManualBorrowerOpen(true);
                }}
              >
                Change borrower
              </button>
              {borrowerOverride && autoBorrowerAddress ? (
                <button
                  type="button"
                  className={btnNeutral}
                  onClick={() => {
                    setBorrowerOverride(false);
                    setManualBorrowerOpen(false);
                  }}
                >
                  Use automatic selection
                </button>
              ) : null}
              <button
                type="button"
                className="text-sm text-slate-500 underline decoration-slate-600 underline-offset-2 hover:text-slate-400"
                onClick={() => {
                  setBorrowerOverride(false);
                  setRepayAmount("");
                  setManualBorrowerOpen(false);
                }}
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <label className="text-sm text-slate-300">
              <span className={label}>{manualBorrowerOpen ? "Borrower address (manual)" : "Borrower address"}</span>
              <input
                value={borrower}
                onChange={(e) => setBorrower(e.target.value)}
                placeholder="0x…"
                className={input}
                autoFocus={manualBorrowerOpen}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {borrowerAddress ? (
                <button
                  type="button"
                  className={btnNeutral}
                  onClick={() => {
                    if (isAddress(borrower.trim())) {
                      setBorrowerOverride(true);
                      setManualBorrowerOpen(false);
                    } else toast.error("Enter a valid address first");
                  }}
                >
                  Use this address
                </button>
              ) : null}
              {manualBorrowerOpen ? (
                <button
                  type="button"
                  className="text-sm text-slate-500 underline decoration-slate-600 underline-offset-2 hover:text-slate-400"
                  onClick={() => {
                    setManualBorrowerOpen(false);
                    if (!borrowerAddress) setBorrower("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        )}

        {!borrowerAddress && !manualBorrowerOpen ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-700/90 bg-slate-950/40 p-4 text-sm text-slate-400">
            <p>
              {noLiquidatableInScan
                ? "No automatic borrower — add candidates or enter an address manually."
                : "Waiting for scan…"}
            </p>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-cyan-400/90 hover:text-cyan-300"
              onClick={() => setManualBorrowerOpen(true)}
            >
              Enter borrower address manually
            </button>
          </div>
        ) : null}

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          This wallet <em>took the loan</em> in the pool. Your wallet is the liquidator. The contract uses this address to
          know which debt and collateral to move—it is not a bank transfer to that person. Open a link with{" "}
          <code className={code}>?borrower=0x…</code> to pre-fill a custom target.
        </p>
        {!borrowerAddress && borrower.trim() ? (
          <p className="mt-2 text-sm text-red-400">Enter a valid EVM address.</p>
        ) : null}

        <h3 className="mt-8 text-sm font-semibold text-slate-200">Repay with USDT</h3>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
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
        {!borrowerAddress && isConnected && ready && !scanLoading && !noLiquidatableInScan ? (
          <p className="mt-2 text-xs text-slate-500">Select a target borrower above.</p>
        ) : null}
        {!borrowerAddress && isConnected && ready && noLiquidatableInScan && !borrowerOverride ? (
          <p className="mt-2 text-xs text-amber-200/80">
            Liquidate is disabled until there is a liquidatable loan in the scan or you enter a valid borrower manually.
          </p>
        ) : null}
        {borrowerAddress && parsedRepay != null && !isLiquidatable ? (
          <p className="mt-2 text-xs text-amber-200/80">This position is not liquidatable (HF must be &lt; 1).</p>
        ) : null}

        {approveTx.error ? <p className="mt-3 text-sm text-red-400">{approveTx.error.message}</p> : null}
        {liquidateTx.error ? <p className="mt-3 text-sm text-red-400">{liquidateTx.error.message}</p> : null}
      </section>

      {showAdvancedScan && poolConfigured ? (
        <section className={`${card} mt-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">All liquidatable in scan</h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-500">
                Same candidate set as above ({hasCustomScanList ? "NEXT_PUBLIC_LIQUIDATION_CANDIDATES" : "Hardhat default accounts"}
                ). Sorted by highest HF first. Use <strong className="text-slate-400">Select</strong> to override the
                automatic target.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void scanRead.refetch()}
              disabled={!poolConfigured || scanRead.isFetching}
              className={btnNeutral}
            >
              {scanRead.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {!poolConfigured ? (
            <p className="mt-4 text-sm text-slate-500">Set NEXT_PUBLIC_LENDING_POOL_ADDRESS to scan.</p>
          ) : scanLoading ? (
            <p className="mt-4 text-sm text-slate-500">Scanning candidate addresses…</p>
          ) : eligibleRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No liquidatable positions in the current scan. Positions need debt and HF &lt; 1.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800/80">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Borrower</th>
                    <th className="px-3 py-2 font-medium">Health factor</th>
                    <th className="px-3 py-2 font-medium">Debt (USDT)</th>
                    <th className="px-3 py-2 font-medium">Collateral (ETH)</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {eligibleRows.map((row) => {
                    const hfDisplay = Number(formatUnits(row.hf, 18)).toFixed(4);
                    const isPrimary = autoBorrowerAddress === row.address && !borrowerOverride;
                    return (
                      <tr key={row.address} className="hover:bg-slate-900/40">
                        <td className="max-w-[14rem] px-3 py-2 font-mono text-[11px] leading-snug break-all text-cyan-300/90 sm:max-w-none">
                          {row.address}
                          {isPrimary ? (
                            <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                              auto pick
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-red-400/95">{hfDisplay}</td>
                        <td className="px-3 py-2">{fmt(row.debt, usdtDecimals)}</td>
                        <td className="px-3 py-2">{fmt(row.coll, 18)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-cyan-400/90 hover:text-cyan-300"
                            onClick={() => {
                              setBorrower(row.address);
                              setBorrowerOverride(true);
                              setManualBorrowerOpen(false);
                              setRepayAmount("");
                            }}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

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
