import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import type { AdminActionLog } from "@/lib/types";

export const runtime = "nodejs";

type ActionCountRow = {
  action: string;
  count: string;
};

export async function GET() {
  try {
    const recent = await query<AdminActionLog>(
      `
      SELECT id, username, action, details, created_at
      FROM admin_action_logs
      ORDER BY created_at DESC
      LIMIT 20
      `,
    );
    const actionCounts = await query<ActionCountRow>(
      `
      SELECT action, COUNT(*)::text AS count
      FROM admin_action_logs
      GROUP BY action
      ORDER BY COUNT(*) DESC
      `,
    );

    return NextResponse.json({
      recentActions: recent.rows,
      actionCounts: actionCounts.rows.map((r) => ({ action: r.action, count: Number(r.count) })),
      // Placeholders until snapshot/liquidation tables are added in later steps.
      liquidationRecords: [],
      apySnapshots: [],
      utilizationSnapshots: [],
      notes: "Off-chain analytics are DB-backed support data; on-chain is source of truth.",
    });
  } catch (error) {
    console.error("dashboard analytics error", error);
    return NextResponse.json(
      { error: "Failed to load analytics. Check DATABASE_URL and DB schema." },
      { status: 500 },
    );
  }
}
