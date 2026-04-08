"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import { card } from "@/lib/ui";

type ProtocolAnalyticsResponse = {
  protocolEventCounts: Array<{ event: string; count: number }>;
  recentProtocolActivity: Array<{
    id: string;
    event_name: string;
    user_address: string;
    counterparty_address: string | null;
    amount_base_units: string | null;
    tx_hash: string;
    block_number: string;
    created_at: string;
  }>;
  liquidationRecords: Array<{
    id: string;
    user_address: string;
    counterparty_address: string | null;
    amount_base_units: string | null;
    tx_hash: string;
    block_number: string;
    created_at: string;
  }>;
  hourlyActivity: Array<{ hour: string; count: number }>;
  range: "24h" | "7d";
  notes: string;
  error?: string;
};

function fmtTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function compactBucketLabel(value: string): string {
  // yyyy-mm-dd hh:00:00 -> hh:00 ; yyyy-mm-dd -> mm-dd
  if (value.includes(" ")) return value.slice(11, 16);
  if (value.length >= 10) return value.slice(5, 10);
  return value;
}

type SeriesPoint = { label: string; count: number };

function buildSeries(hourly: Array<{ hour: string; count: number }>, range: "24h" | "7d"): SeriesPoint[] {
  const now = new Date();
  if (range === "24h") {
    const end = new Date(now);
    end.setMinutes(0, 0, 0);
    const buckets: SeriesPoint[] = [];
    const byLabel = new Map(hourly.map((h) => [compactBucketLabel(h.hour), h.count]));
    for (let i = 23; i >= 0; i--) {
      const d = new Date(end);
      d.setHours(end.getHours() - i);
      const label = `${d.getHours().toString().padStart(2, "0")}:00`;
      buckets.push({ label, count: byLabel.get(label) ?? 0 });
    }
    return buckets;
  }

  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const buckets: SeriesPoint[] = [];
  const byLabel = new Map(hourly.map((h) => [compactBucketLabel(h.hour), h.count]));
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const label = `${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
    buckets.push({ label, count: byLabel.get(label) ?? 0 });
  }
  return buckets;
}

function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function shortAddress(v: string | null | undefined): string {
  if (!v) return "—";
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

function eventUnit(eventName: string): "ETH" | "USDT" | "RAW" {
  if (eventName === "DepositCollateral" || eventName === "WithdrawCollateral") return "ETH";
  if (
    eventName === "DepositLiquidity" ||
    eventName === "WithdrawLiquidity" ||
    eventName === "Borrow" ||
    eventName === "Repay" ||
    eventName === "Liquidate"
  ) {
    return "USDT";
  }
  return "RAW";
}

function fmtAmountBaseUnits(amountBaseUnits: string | null, eventName: string): string {
  if (!amountBaseUnits) return "—";
  const unit = eventUnit(eventName);
  if (unit === "RAW") return amountBaseUnits;

  try {
    const decimals = 18n;
    const n = BigInt(amountBaseUnits);
    const div = 10n ** decimals;
    const whole = n / div;
    const frac = (n % div).toString().padStart(Number(decimals), "0").slice(0, 4);
    const wholeFmt = Number(whole).toLocaleString("en-US");
    const fracTrimmed = frac.replace(/0+$/, "");
    return fracTrimmed ? `${wholeFmt}.${fracTrimmed} ${unit}` : `${wholeFmt} ${unit}`;
  } catch {
    return `${amountBaseUnits} ${unit}`;
  }
}

export function PoolAnalyticsPanel() {
  const [analytics, setAnalytics] = useState<ProtocolAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastToastedError = useRef<string | null>(null);
  const [range, setRange] = useState<"24h" | "7d">("24h");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      try {
        const res = await fetch(`/api/protocol/analytics?range=${range}`);
        const data = (await res.json()) as ProtocolAnalyticsResponse & { error?: string };
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? "Failed to load protocol analytics");
          setAnalytics(null);
          return;
        }
        setAnalytics(data);
        setError(null);
      } catch {
        if (active) setError("Failed to load protocol analytics");
      }
    }

    void loadAnalytics();
    const id = setInterval(() => void loadAnalytics(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [range]);

  useEffect(() => {
    if (error && error !== lastToastedError.current) {
      lastToastedError.current = error;
      toast.error(error);
    }
    if (!error) lastToastedError.current = null;
  }, [error]);

  async function copyTxHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      toast.success("Tx hash copied");
    } catch {
      toast.error("Failed to copy tx hash");
    }
  }

  const hourly = analytics?.hourlyActivity ?? [];
  const chartSeries = analytics ? buildSeries(hourly, analytics.range) : [];
  const maxHourly = chartSeries.reduce((m, p) => (p.count > m ? p.count : m), 0);
  const eventMix = analytics?.protocolEventCounts ?? [];
  const maxEventCount = eventMix.reduce((m, p) => (p.count > m ? p.count : m), 0);

  if (!mounted) {
    return (
      <section className={`${card} mt-8`}>
        <h2 className="text-base font-semibold text-slate-100">Protocol activity analytics</h2>
        <p className="mt-1 text-xs text-slate-500">Indexed from on-chain pool events into PostgreSQL.</p>
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      </section>
    );
  }

  return (
    <section className={`${card} mt-8`}>
      <h2 className="text-base font-semibold text-slate-100">Protocol activity analytics</h2>
      <p className="mt-1 text-xs text-slate-500">Indexed from on-chain pool events into PostgreSQL.</p>
      <div className="mt-3 inline-flex rounded-lg border border-slate-800 bg-slate-950/40 p-1 text-xs">
        <button
          type="button"
          onClick={() => setRange("24h")}
          className={`rounded px-2 py-1 ${
            range === "24h" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          24h
        </button>
        <button
          type="button"
          onClick={() => setRange("7d")}
          className={`rounded px-2 py-1 ${
            range === "7d" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          7d
        </button>
      </div>
      {!analytics ? (
        <p className="mt-4 text-sm text-slate-500">{error ? "Unable to load." : "Loading…"}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-400">{analytics.notes}</p>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Transaction activity ({analytics.range === "7d" ? "last 7 days" : "last 24 hours"})
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Y-axis: number of indexed pool events per {analytics.range === "7d" ? "day" : "hour"}.
              </p>
              {hourly.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  No activity in the last {analytics.range === "7d" ? "7 days" : "24 hours"}.
                </p>
              ) : (
                <>
                  <div className="mt-4 rounded-md border border-slate-800/80 bg-slate-950/40 p-2">
                    <svg viewBox="0 0 1000 240" className="h-48 w-full">
                      <defs>
                        <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(34, 211, 238, 0.45)" />
                          <stop offset="100%" stopColor="rgba(34, 211, 238, 0.02)" />
                        </linearGradient>
                      </defs>
                      {[0, 25, 50, 75, 100].map((g) => (
                        <line
                          key={g}
                          x1="40"
                          x2="980"
                          y1={20 + ((100 - g) / 100) * 180}
                          y2={20 + ((100 - g) / 100) * 180}
                          stroke="rgba(148,163,184,0.18)"
                          strokeWidth="1"
                        />
                      ))}
                      {(() => {
                        const left = 40;
                        const width = 940;
                        const top = 20;
                        const height = 180;
                        const points = chartSeries.map((p, i) => {
                          const x = left + (chartSeries.length === 1 ? 0 : (i / (chartSeries.length - 1)) * width);
                          const ratio = maxHourly === 0 ? 0 : p.count / maxHourly;
                          const y = top + (1 - ratio) * height;
                          return { x, y, count: p.count, label: p.label };
                        });
                        const strokePath = linePath(points);
                        const areaPath =
                          points.length > 1
                            ? `${strokePath} L ${left + width} ${top + height} L ${left} ${top + height} Z`
                            : "";
                        return (
                          <>
                            {areaPath ? <path d={areaPath} fill="url(#activityFill)" /> : null}
                            {strokePath ? (
                              <path
                                d={strokePath}
                                fill="none"
                                stroke="rgb(34,211,238)"
                                strokeWidth="2.5"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                              />
                            ) : null}
                            {points.map((p) => (
                              <g key={`${p.label}-${p.count}`}>
                                <circle cx={p.x} cy={p.y} r="3" fill="rgb(34,211,238)" />
                                <title>{`${p.label}: ${p.count} event(s)`}</title>
                              </g>
                            ))}
                            <text x="12" y="28" fill="rgba(148,163,184,0.9)" fontSize="11">
                              max {maxHourly} events
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                    <span>Start: {chartSeries[0]?.label ?? "—"}</span>
                    <span>{analytics.range === "7d" ? "Daily buckets (events/day)" : "Hourly buckets (events/hour)"}</span>
                    <span>End: {chartSeries[chartSeries.length - 1]?.label ?? "—"}</span>
                  </div>
                </>
              )}
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Event distribution
              </h3>
              {eventMix.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">No indexed protocol events yet.</p>
              ) : (
                <ul className="mt-4 space-y-2 text-xs text-slate-300">
                  {eventMix.map((row) => {
                    const w = maxEventCount === 0 ? 0 : Math.max(8, Math.round((row.count / maxEventCount) * 100));
                    return (
                      <li key={row.event}>
                        <div className="mb-1 flex justify-between">
                          <span>{row.event}</span>
                          <span className="tabular-nums text-slate-400">{row.count}</span>
                        </div>
                        <div className="h-2 rounded bg-slate-800">
                          <div className="h-2 rounded bg-emerald-400/80" style={{ width: `${w}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent protocol activity</h3>
            <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-xs text-slate-400">
              {analytics.recentProtocolActivity.length === 0 ? (
                <li className="text-slate-500">No protocol activity rows.</li>
              ) : null}
              {analytics.recentProtocolActivity.map((r) => (
                <li key={r.id} className="rounded border border-slate-800/80 bg-slate-950/40 px-2 py-1.5 font-mono">
                  {r.event_name === "Liquidate" ? (
                    <span className="mr-1 rounded border border-rose-500/40 bg-rose-500/10 px-1 text-[10px] text-rose-300">
                      LIQ
                    </span>
                  ) : null}
                  {fmtTime(r.created_at)} · {r.event_name} · user {shortAddress(r.user_address)} · amt{" "}
                  {fmtAmountBaseUnits(r.amount_base_units, r.event_name)} ·{" "}
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
          </div>
        </>
      )}
    </section>
  );
}

