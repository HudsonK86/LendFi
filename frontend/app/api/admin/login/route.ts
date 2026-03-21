import { NextRequest, NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/hash";
import { getAdminSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import type { AdminUser } from "@/lib/types";

export const runtime = "nodejs";

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const username = body.username.trim();
  const password = body.password;

  let user: AdminUser | undefined;
  try {
    const { rows } = await query<AdminUser>(
      `SELECT username, password_hash, salt, created_at FROM admin_users WHERE username = $1`,
      [username],
    );
    user = rows[0];
  } catch (e) {
    console.error("admin login db error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const res = NextResponse.json({ username: user.username });
  try {
    const session = await getAdminSession(request, res);
    session.username = user.username;
    session.isAdmin = true;
    await session.save();
  } catch (e) {
    console.error("admin login session error", e);
    return NextResponse.json({ error: "Server is not configured for sessions" }, { status: 500 });
  }

  return res;
}
