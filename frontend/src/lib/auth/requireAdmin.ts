import type { IronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { AdminSessionData } from "./session";
import { getAdminSession } from "./session";

/**
 * For Route Handlers: returns session if authenticated admin, else a 401 JSON response.
 * Uses a throwaway response for reading the cookie; no session cookie is written.
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<
  { ok: true; session: IronSession<AdminSessionData> } | { ok: false; response: NextResponse }
> {
  const probe = new NextResponse(null);
  const session = await getAdminSession(request, probe);
  if (!session.username || !session.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}
