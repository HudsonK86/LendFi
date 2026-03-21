import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type AdminSessionData = {
  username?: string;
  isAdmin?: boolean;
};

const COOKIE_NAME = "lendfi_admin_session";

function sessionPassword(): string {
  const p = process.env.IRON_SESSION_PASSWORD;
  if (!p || p.length < 32) {
    throw new Error("IRON_SESSION_PASSWORD must be set and at least 32 characters long");
  }
  return p;
}

/** Session options for iron-session (call per request; reads env at runtime). */
export function getIronSessionOptions(): SessionOptions {
  return {
    cookieName: COOKIE_NAME,
    password: sessionPassword(),
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getAdminSession(
  req: NextRequest,
  res: NextResponse,
): Promise<IronSession<AdminSessionData>> {
  return getIronSession<AdminSessionData>(req, res, getIronSessionOptions());
}
