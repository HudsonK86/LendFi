"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { toast } from "react-toastify";

import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { FRToken_ABI, LendingPool_ABI, MockUSDT_ABI } from "@/abi";
import { getPoolActivityLabel, formatPoolActivityAmountBaseUnits } from "@/lib/events/poolActivity";
import { shortAddress } from "@/lib/format/address";
import { formatDateTime } from "@/lib/format/dateTime";
import { getJson } from "@/lib/api/http";
import { ANALYTICS_POLL_MS } from "@/lib/polling";
import { CONTRACT_ADDRESSES } from "@/utils/smartContractAddress";
import { debtToCollateralRatioBps, formatBpsAsPercent, isDebtAboveLiquidationLine } from "@/lib/protocol-params";
import { card, shell } from "@/lib/ui";
import { BorrowClient } from "../borrow/BorrowClient";
import { PoolClient } from "../pool/PoolClient";

const lendingPoolAddress = CONTRACT_ADDRESSES.lendingPool;
const usdtAddress = CONTRACT_ADDRESSES.mockUsdt;
const frTokenAddress = CONTRACT_ADDRESSES.frToken;

function fmt(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtSigned(value?: bigint, decimals = 18, digits = 4) {
  if (value == null) return "—";
  if (value === 0n) return "0";
  const sign = value > 0n ? "+" : "-";
  const abs = value > 0n ? value : -value;
  return `${sign}${Number(formatUnits(abs, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}

export function DashboardClient() {
  const [workspaceTab, setWorkspaceTab] = useState<
    "supply" | "withdraw" | "liquidate" | "depositCollateral" | "borrow" | "repay" | "withdrawCollateral"
  >("supply");
  const { address } = useAccount();
  const [recentTx, setRecentTx] = useState<
    Array<{
      id: string;
      event_name: string;
      amount_base_units: string | null;
      tx_hash: string;
      created_at: string;
      user_address: string;
    }>
  >([]);
  const [txLoading, setTxLoading] = useState(false);
  const [selectedTxEvents, setSelectedTxEvents] = useState<string[]>([]);
  const { data: walletEthBalance } = useBalance({ address, query: { enabled: Boolean(address) } });

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
  const collateralValueRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getCollateralValue",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && lendingPoolAddress) },
  });
  const debtValueRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getDebtValue",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && lendingPoolAddress) },
  });
  const maxBorrowRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "getMaxBorrow",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && lendingPoolAddress) },
  });
  const collateralEthRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "collateralETH",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && lendingPoolAddress) },
  });
  const debtUsdtRead = useReadContract({
    abi: LendingPool_ABI,
    address: lendingPoolAddress,
    functionName: "debtUSDT",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && lendingPoolAddress) },
  });

  const debtVal = debtValueRead.data as bigint | undefined;
  const collateralVal = collateralValueRead.data as bigint | undefined;
  const currentDebtUsdt = debtUsdtRead.data as bigint | undefined;
  const netAccountValue = useMemo(() => {
    if (collateralVal == null || currentDebtUsdt == null) return undefined;
    return collateralVal - currentDebtUsdt;
  }, [collateralVal, currentDebtUsdt]);
  const debtRatioBps = useMemo(() => {
    if (debtVal == null || collateralVal == null) return undefined;
    return debtToCollateralRatioBps(debtVal, collateralVal);
  }, [collateralVal, debtVal]);
  const isAboveRiskLine = debtRatioBps != null && Number(debtRatioBps) > 8000;
  const riskState = useMemo(() => {
    if (debtVal == null || collateralVal == null) return "No position";
    return isDebtAboveLiquidationLine(debtVal, collateralVal) ? "At risk" : "Healthy";
  }, [collateralVal, debtVal]);
  const ready =
    Boolean(isAddress(String(lendingPoolAddress))) &&
    Boolean(isAddress(String(usdtAddress))) &&
    Boolean(isAddress(String(frTokenAddress)));
  const tabMeta: Record<
    "supply" | "withdraw" | "liquidate" | "depositCollateral" | "borrow" | "repay" | "withdrawCollateral",
    { label: string; group: "Liquidity" | "Credit" | "Risk"; impact: string }
  > = {
    supply: {
      label: "Deposit USDT",
      group: "Liquidity",
      impact: "Increases FR position and pool liquidity; no direct debt-risk impact.",
    },
    withdraw: {
      label: "Withdraw USDT",
      group: "Liquidity",
      impact: "Burns FR for USDT; no direct debt-risk impact unless you rely on pool depth for borrowing.",
    },
    liquidate: {
      label: "Liquidate",
      group: "Risk",
      impact: "Targets unhealthy accounts; can reduce protocol systemic risk while earning liquidation bonus.",
    },
    depositCollateral: {
      label: "Deposit ETH Collateral",
      group: "Credit",
      impact: "Usually improves health ratio by increasing collateral value.",
    },
    borrow: {
      label: "Borrow",
      group: "Credit",
      impact: "Raises debt and pushes debt/collateral ratio upward.",
    },
    repay: {
      label: "Repay",
      group: "Credit",
      impact: "Lowers debt and improves safety buffer below liquidation threshold.",
    },
    withdrawCollateral: {
      label: "Withdraw ETH Collateral",
      group: "Credit",
      impact: "Reduces collateral buffer and can worsen health ratio.",
    },
  };
  const activeMeta = tabMeta[workspaceTab];
  const impactTone =
    workspaceTab === "borrow" || workspaceTab === "withdrawCollateral"
      ? "text-amber-300"
      : workspaceTab === "repay" || workspaceTab === "depositCollateral"
        ? "text-emerald-300"
        : "text-slate-300";
  const groupToneClass =
    activeMeta.group === "Liquidity"
      ? "border border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
      : activeMeta.group === "Credit"
        ? "border border-violet-400/30 bg-violet-500/15 text-violet-200"
        : "border border-amber-400/30 bg-amber-500/15 text-amber-200";
  const tabActiveClass = (tab: keyof typeof tabMeta) =>
    tabMeta[tab].group === "Liquidity"
      ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-100"
      : tabMeta[tab].group === "Credit"
        ? "border-violet-400/40 bg-violet-500/20 text-violet-100"
        : "border-amber-400/40 bg-amber-500/20 text-amber-100";
  const txEventOptions = useMemo(() => {
    return Array.from(new Set(recentTx.map((r) => r.event_name)));
  }, [recentTx]);
  const filteredRecentTx = useMemo(() => {
    if (selectedTxEvents.length === 0) return recentTx;
    return recentTx.filter((r) => selectedTxEvents.includes(r.event_name));
  }, [recentTx, selectedTxEvents]);

  useEffect(() => {
    let active = true;
    async function loadUserTx() {
      if (!address || !isAddress(address)) {
        if (active) setRecentTx([]);
        return;
      }
      setTxLoading(true);
      try {
        const result = await getJson<{ items?: typeof recentTx }>(
          `/api/protocol/user-transactions?address=${address.toLowerCase()}&limit=20`,
        );
        if (!active) return;
        setRecentTx(result.ok ? result.data.items ?? [] : []);
      } catch {
        if (active) setRecentTx([]);
      } finally {
        if (active) setTxLoading(false);
      }
    }
    void loadUserTx();
    const id = setInterval(() => void loadUserTx(), ANALYTICS_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [address]);

  useEffect(() => {
    if (txEventOptions.length === 0) {
      setSelectedTxEvents([]);
      return;
    }
    setSelectedTxEvents((prev) => prev.filter((e) => txEventOptions.includes(e)));
  }, [txEventOptions]);

  async function copyTxHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      toast.success("Tx hash copied");
    } catch {
      toast.error("Failed to copy tx hash");
    }
  }
  return (
    <main className={shell}>
      <PageHeader
        title="Dashboard"
        subtitle="Shared account view + execution workspace with liquidity and credit actions."
      />
      <section className={`${card} mt-8 bg-gradient-to-br from-slate-900/70 to-slate-950/60`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Account summary</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              riskState === "At risk"
                ? "border border-red-400/30 bg-red-500/15 text-red-200"
                : "border border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
            }`}
          >
            {riskState}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Wallet USDT" value={fmt(usdtBalance.data as bigint | undefined)} />
          <StatTile
            label="Wallet ETH"
            value={
              walletEthBalance
                ? `${Number(formatUnits(walletEthBalance.value, walletEthBalance.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })}`
                : "—"
            }
          />
          <StatTile label="FR balance" value={fmt(frBalance.data as bigint | undefined)} />
          <StatTile label="Allowance to pool (USDT)" value={fmt(allowance.data as bigint | undefined)} />
          <StatTile label="Collateral (ETH)" value={fmt(collateralEthRead.data as bigint | undefined)} />
          <StatTile
            label="Current debt (USDT)"
            value={
              <span className={debtRatioBps == null ? "text-slate-100" : isAboveRiskLine ? "text-red-300" : "text-emerald-300"}>
                {fmt(debtUsdtRead.data as bigint | undefined)}
              </span>
            }
          />
          <StatTile label="Collateral value (USDT)" value={fmt(collateralVal)} />
          <StatTile label="Borrow power (USDT)" value={fmt(maxBorrowRead.data as bigint | undefined)} />
          <StatTile
            label="Health ratio"
            value={
              <span className={debtRatioBps == null ? "text-slate-100" : isAboveRiskLine ? "text-red-300" : "text-emerald-300"}>
                {debtRatioBps != null ? formatBpsAsPercent(Number(debtRatioBps), 2) : "—"}
              </span>
            }
          />
          <StatTile
            label="Net value (USDT)"
            value={
              <span
                className={
                  netAccountValue == null
                    ? "text-slate-100"
                    : netAccountValue < 0n
                      ? "text-red-300"
                      : netAccountValue > 0n
                        ? "text-emerald-300"
                        : "text-slate-100"
                }
              >
                {fmtSigned(netAccountValue)}
              </span>
            }
          />
        </div>
      </section>

      {!ready ? (
        <p className="mt-4 text-sm text-red-400">Set pool, USDT, and FR addresses in `frontend/.env`.</p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <section className={`${card} h-full bg-gradient-to-br from-slate-900/70 to-slate-950/60`}>
            <h2 className="text-base font-semibold text-slate-100">Execution workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Action ticket with shared balances and live risk context.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${groupToneClass}`}>{activeMeta.group}</span>
              <span className="rounded-full border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-200">
                {activeMeta.label}
              </span>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-300/90">Pool Liquidity</p>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                {(["supply", "withdraw", "liquidate"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setWorkspaceTab(tab)}
                    className={`rounded border px-3 py-2 text-left transition ${
                      workspaceTab === tab
                        ? tabActiveClass(tab)
                        : "border-slate-700/70 bg-slate-950/40 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                    }`}
                  >
                    {tabMeta[tab].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300/90">Credit / Collateral</p>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                {(["depositCollateral", "borrow", "repay", "withdrawCollateral"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setWorkspaceTab(tab)}
                  className={`rounded border px-3 py-2 text-left transition ${
                    workspaceTab === tab
                      ? tabActiveClass(tab)
                      : "border-slate-700/70 bg-slate-950/40 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  }`}
                >
                  {tabMeta[tab].label}
                </button>
              ))}
              </div>
            </div>
        </section>

        <section className={`${card} h-full bg-gradient-to-br from-slate-900/70 to-slate-950/60 lg:flex lg:items-center`}>
          <div className="w-full">
          {workspaceTab === "supply" ? (
            <PoolClient
              embedded
              mode="modulesOnly"
              hideBalancesCard
              forcedActionTab="deposit"
              hideEmbeddedHeader
              compactActionOnly
              actionHint={activeMeta.impact}
            />
          ) : null}
          {workspaceTab === "withdraw" ? (
            <PoolClient
              embedded
              mode="modulesOnly"
              hideBalancesCard
              forcedActionTab="withdraw"
              hideEmbeddedHeader
              compactActionOnly
              actionHint={activeMeta.impact}
            />
          ) : null}
          {workspaceTab === "liquidate" ? (
            <PoolClient
              embedded
              mode="modulesOnly"
              hideBalancesCard
              forcedActionTab="liquidate"
              hideEmbeddedHeader
              compactActionOnly
              actionHint={activeMeta.impact}
            />
          ) : null}
          {workspaceTab === "depositCollateral" ? (
            <BorrowClient
              embedded
              hideWalletStats
              focusAction="deposit"
              hideEmbeddedHeader
              hidePositionSection
              actionHint={activeMeta.impact}
            />
          ) : null}
          {workspaceTab === "borrow" ? (
            <BorrowClient
              embedded
              hideWalletStats
              focusAction="borrow"
              hideEmbeddedHeader
              hidePositionSection
              actionHint={activeMeta.impact}
            />
          ) : null}
          {workspaceTab === "repay" ? (
            <BorrowClient
              embedded
              hideWalletStats
              focusAction="repay"
              hideEmbeddedHeader
              hidePositionSection
              actionHint={activeMeta.impact}
            />
          ) : null}
          {workspaceTab === "withdrawCollateral" ? (
            <BorrowClient
              embedded
              hideWalletStats
              focusAction="withdraw"
              hideEmbeddedHeader
              hidePositionSection
              actionHint={activeMeta.impact}
            />
          ) : null}
          </div>
        </section>
      </div>

      <section className={`${card} mt-8 bg-gradient-to-br from-slate-900/70 to-slate-950/60`}>
        <h2 className="text-base font-semibold text-slate-100">Recent Transactions</h2>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setSelectedTxEvents([])}
            className={`rounded border px-2 py-1 ${
              selectedTxEvents.length === 0
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            All
          </button>
          {txEventOptions.map((eventName) => {
            const selected = selectedTxEvents.includes(eventName);
            return (
              <button
                key={eventName}
                type="button"
                onClick={() =>
                  setSelectedTxEvents((prev) =>
                    prev.includes(eventName) ? prev.filter((e) => e !== eventName) : [...prev, eventName],
                  )
                }
                className={`rounded border px-2 py-1 ${
                  selected
                    ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                    : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                {getPoolActivityLabel(eventName)}
              </button>
            );
          })}
        </div>
        {txLoading ? <p className="mt-3 text-xs text-slate-500">Loading recent transactions…</p> : null}
        <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-xs text-slate-400">
          {filteredRecentTx.length === 0 && !txLoading ? (
            <li className="text-slate-500">No transactions for this wallet yet.</li>
          ) : null}
          {filteredRecentTx.map((r) => (
            <li key={r.id} className="rounded border border-slate-800/80 bg-slate-950/40 px-2 py-1.5 font-mono">
              {formatDateTime(r.created_at)} · {getPoolActivityLabel(r.event_name)} · user {shortAddress(r.user_address)} · amt{" "}
              {formatPoolActivityAmountBaseUnits(r.amount_base_units, r.event_name)} ·{" "}
              <button
                type="button"
                onClick={() => void copyTxHash(r.tx_hash)}
                className="text-cyan-400/90 hover:text-cyan-300"
              >
                Copy tx
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
