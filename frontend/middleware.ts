import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { AdminSessionData } from "@/lib/auth/session";
import { getIronSessionOptions } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin/login")) {
    try {
      const res = NextResponse.next();
      const session = await getIronSession<AdminSessionData>(request, res, getIronSessionOptions());
      if (session.username && session.isAdmin) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return res;
    } catch {
      return NextResponse.next();
    }
  }

  try {
    const res = NextResponse.next();
    const session = await getIronSession<AdminSessionData>(request, res, getIronSessionOptions());
    if (!session.username || !session.isAdmin) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("from", path);
      return NextResponse.redirect(login);
    }
    return res;
  } catch {
    const login = new URL("/admin/login", request.url);
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
