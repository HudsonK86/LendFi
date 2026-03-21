import { NextRequest, NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth/hash";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

type InitBody = {
  username?: unknown;
  password?: unknown;
  secret?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: InitBody;
  try {
    body = (await request.json()) as InitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isNonEmptyString(body.username) || !isNonEmptyString(body.password) || !isNonEmptyString(body.secret)) {
    return NextResponse.json({ error: "username, password, and secret are required" }, { status: 400 });
  }

  const expected = process.env.ADMIN_DB_INIT_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Server is not configured for admin init" }, { status: 500 });
  }

  if (body.secret !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const username = body.username.trim();
  const password = body.password;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const countRes = await client.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM admin_users FOR UPDATE");
    const n = parseInt(countRes.rows[0]?.n ?? "0", 10);
    if (n > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Admin already initialized" }, { status: 409 });
    }

    const { hash, salt } = hashPassword(password);
    await client.query(
      `INSERT INTO admin_users (username, password_hash, salt) VALUES ($1, $2, $3)`,
      [username, hash, salt],
    );
    await client.query(
      `INSERT INTO admin_action_logs (username, action, details) VALUES ($1, $2, $3)`,
      [username, "init_admin", null],
    );
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("admin init error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ username }, { status: 201 });
}
