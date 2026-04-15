"use client";

import { useEffect, useRef, useState } from "react";

import { getJson } from "@/lib/api/http";
import { formatDateTime } from "@/lib/format/dateTime";
import { ANALYTICS_POLL_MS } from "@/lib/polling";
import type { AdminActionLog } from "@/lib/types";
import { card } from "@/lib/ui";
import { appToast } from "@/utils/toast";

type AnalyticsResponse = {
  recentActions: AdminActionLog[];
  error?: string;
};

function formatOracleLogDetails(action: string, details: string | null): string | null {
  if (!details || action !== "set_oracle_price") return null;
  try {
    const o = JSON.parse(details) as {
      previousPriceUsdtPerEth?: string;
      newPriceUsdtPerEth?: string;
    };
    const a = o.previousPriceUsdtPerEth ?? "—";
    const b = o.newPriceUsdtPerEth ?? "—";
    return `${a} → ${b} USDT/ETH`;
  } catch {
    return null;
  }
}

export function AdminAnalyticsPanel() {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const lastToastedError = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      try {
        const result = await getJson<AnalyticsResponse>("/api/admin/analytics", { credentials: "include" });
        if (!active) return;
        if (!result.ok && result.status === 401) {
          setAnalyticsError("Sign in as admin to view analytics.");
          setAnalytics(null);
          return;
        }
        if (!result.ok) {
          setAnalyticsError(result.error ?? "Failed to load analytics");
          setAnalytics(null);
          return;
        }
        setAnalytics(result.data);
        setAnalyticsError(null);
      } catch {
        if (active) setAnalyticsError("Failed to load analytics");
      }
    }
    void loadAnalytics();
    const id = setInterval(() => void loadAnalytics(), ANALYTICS_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (analyticsError && analyticsError !== lastToastedError.current) {
      lastToastedError.current = analyticsError;
      appToast.error(analyticsError);
    }
    if (!analyticsError) lastToastedError.current = null;
  }, [analyticsError]);

  return (
    <section className={`${card} mt-10`}>
      <h2 className="text-base font-semibold text-slate-100">Oracle Price History</h2>
      <p className="mt-1 text-xs text-slate-500">Recent admin updates to oracle ETH/USDT price.</p>
      {!analytics ? (
        <p className="mt-4 text-sm text-slate-500">{analyticsError ? "Unable to load." : "Loading…"}</p>
      ) : (
        <>
          <div className="mt-6">
            <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-xs text-slate-400">
              {analytics.recentActions.length === 0 ? <li>No recent actions.</li> : null}
              {analytics.recentActions.map((r) => {
                const oracleLine = formatOracleLogDetails(r.action, r.details);
                return (
                  <li key={r.id} className="rounded border border-slate-800/80 bg-slate-950/40 px-2 py-1.5 font-mono">
                    <div>
                      {formatDateTime(r.created_at)} · {r.username} · {r.action}
                    </div>
                    {oracleLine ? <div className="mt-1 text-[11px] text-slate-500">{oracleLine}</div> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
