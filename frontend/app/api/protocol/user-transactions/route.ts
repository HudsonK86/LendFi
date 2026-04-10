import { NextResponse } from "next/server";

import { query } from "@/lib/db";

export const runtime = "nodejs";

type UserActivityRow = {
  id: string;
  event_name: string;
  user_address: string;
  counterparty_address: string | null;
  amount_base_units: string | null;
  tx_hash: string;
  block_number: string;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = (searchParams.get("address") ?? "").trim().toLowerCase();
    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid or missing address query parameter." }, { status: 400 });
    }

    const rows = await query<UserActivityRow>(
      `
      SELECT
        id::text,
        event_name,
        user_address,
        counterparty_address,
        amount_base_units::text,
        tx_hash,
        block_number::text,
        created_at::text
      FROM pool_activity
      WHERE user_address = $1 OR counterparty_address = $1
      ORDER BY block_number DESC, log_index DESC
      LIMIT $2
      `,
      [address, limit],
    );

    return NextResponse.json({
      items: rows.rows,
      address,
      notes: "Recent transactions for the connected wallet from indexed protocol events.",
    });
  } catch (error) {
    console.error("user-transactions error", error);
    return NextResponse.json(
      { error: "Failed to load recent transactions. Check DATABASE_URL and DB schema." },
      { status: 500 },
    );
  }
}
