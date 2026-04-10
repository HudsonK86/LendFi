import { NextRequest, NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type LogBody = {
  action?: unknown;
  details?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(request: NextRequest) {
  const res = NextResponse.json({});
  let session;
  try {
    session = await getAdminSession(request, res);
  } catch (e) {
    console.error("admin log session error", e);
    return NextResponse.json({ error: "Server is not configured for sessions" }, { status: 500 });
  }

  if (!session.isAdmin || !session.username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LogBody;
  try {
    body = (await request.json()) as LogBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isNonEmptyString(body.action)) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const action = body.action.trim();
  let detailsStr: string | null = null;
  if (body.details !== undefined && body.details !== null) {
    detailsStr = typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  }

  try {
    await query(`INSERT INTO admin_action_logs (username, action, details) VALUES ($1, $2, $3)`, [
      session.username,
      action,
      detailsStr,
    ]);
  } catch (e) {
    console.error("admin log insert error", e);
    return NextResponse.json({ error: "Failed to save log" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
