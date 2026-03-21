import { NextRequest, NextResponse } from "next/server";

import { getAdminSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  try {
    const session = await getAdminSession(request, res);
    session.destroy();
  } catch (e) {
    console.error("admin logout session error", e);
    return NextResponse.json({ error: "Server is not configured for sessions" }, { status: 500 });
  }
  return res;
}
