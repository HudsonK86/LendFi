import { NextRequest, NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import type { AdminActionLog } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const res = NextResponse.json({});
  let session;
  try {
    session = await getAdminSession(request, res);
  } catch (e) {
    console.error("admin analytics session error", e);
    return NextResponse.json({ error: "Server is not configured for sessions" }, { status: 500 });
  }

  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const recent = await query<AdminActionLog>(
      `
      SELECT id, username, action, details, created_at
      FROM admin_action_logs
      ORDER BY created_at DESC
      LIMIT 20
      `,
    );
    return NextResponse.json({
      recentActions: recent.rows,
      notes: "Admin logs are DB-backed support data; on-chain protocol analytics are shown on Pool.",
    });
  } catch (error) {
    console.error("admin analytics error", error);
    return NextResponse.json(
      { error: "Failed to load analytics. Check DATABASE_URL and DB schema." },
      { status: 500 },
    );
  }
}
