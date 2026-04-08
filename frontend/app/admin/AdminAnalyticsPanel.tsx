"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import type { AdminActionLog } from "@/lib/types";
import { card } from "@/lib/ui";

type AnalyticsResponse = {
  recentActions: AdminActionLog[];
  actionCounts: Array<{ action: string; count: number }>;
  liquidationRecords: unknown[];
  apySnapshots: unknown[];
  utilizationSnapshots: unknown[];
  notes: string;
  error?: string;
};

export function AdminAnalyticsPanel() {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const lastToastedError = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/admin/analytics", { credentials: "include" });
        const data = (await res.json()) as AnalyticsResponse & { error?: string };
        if (!active) return;
        if (res.status === 401) {
          setAnalyticsError("Sign in as admin to view analytics.");
          setAnalytics(null);
          return;
        }
        if (!res.ok) {
          setAnalyticsError(data.error ?? "Failed to load analytics");
          setAnalytics(null);
          return;
        }
        setAnalytics(data);
        setAnalyticsError(null);
      } catch {
        if (active) setAnalyticsError("Failed to load analytics");
      }
    }
    void loadAnalytics();
    const id = setInterval(() => void loadAnalytics(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (analyticsError && analyticsError !== lastToastedError.current) {
      lastToastedError.current = analyticsError;
      toast.error(analyticsError);
    }
    if (!analyticsError) lastToastedError.current = null;
  }, [analyticsError]);

  return (
    <section className={`${card} mt-10`}>
      <h2 className="text-base font-semibold text-slate-100">Historical analytics</h2>
      <p className="mt-1 text-xs text-slate-500">PostgreSQL — admin action logs and placeholders.</p>
      {!analytics ? (
        <p className="mt-4 text-sm text-slate-500">{analyticsError ? "Unable to load." : "Loading…"}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-400">{analytics.notes}</p>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action counts</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {analytics.actionCounts.length === 0 ? (
                  <li className="text-slate-500">No actions logged yet.</li>
                ) : null}
                {analytics.actionCounts.map((a) => (
                  <li key={a.action} className="flex justify-between border-b border-slate-800/60 py-1">
                    <span>{a.action}</span>
                    <span className="tabular-nums text-slate-400">{a.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent actions</h3>
              <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-xs text-slate-400">
                {analytics.recentActions.length === 0 ? <li>No recent actions.</li> : null}
                {analytics.recentActions.map((r) => (
                  <li key={r.id} className="rounded border border-slate-800/80 bg-slate-950/40 px-2 py-1.5 font-mono">
                    {r.created_at} · {r.username} · {r.action}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Liquidation records / APY snapshots are placeholders until dedicated tables exist.
          </p>
        </>
      )}
    </section>
  );
}
