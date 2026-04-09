import { NextResponse } from "next/server";

import { query } from "@/lib/db";

export const runtime = "nodejs";

type ProtocolEventCountRow = {
  event_name: string;
  count: string;
};

type ProtocolActivityRow = {
  id: string;
  event_name: string;
  user_address: string;
  counterparty_address: string | null;
  amount_base_units: string | null;
  tx_hash: string;
  block_number: string;
  created_at: string;
};

type HourlyActivityRow = {
  bucket: string;
  count: string;
};

type MarketSeriesRow = {
  bucket: string;
  oracle_price_base_units: string;
  fr_nav_base_units: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") === "7d" ? "7d" : "24h";
    const is7d = range === "7d";
    const bucketExpr = is7d ? "date_trunc('day', created_at)" : "date_trunc('hour', created_at)";
    const formatMask = is7d ? "YYYY-MM-DD" : "YYYY-MM-DD HH24:00:00";
    const intervalSql = is7d ? "interval '7 days'" : "interval '24 hours'";

    const protocolEventCounts = await query<ProtocolEventCountRow>(
      `
      SELECT event_name, COUNT(*)::text AS count
      FROM pool_activity
      GROUP BY event_name
      ORDER BY COUNT(*) DESC
      `,
    );

    const recentProtocolActivity = await query<ProtocolActivityRow>(
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
      ORDER BY block_number DESC, log_index DESC
      LIMIT 20
      `,
    );

    const liquidationRecords = await query<ProtocolActivityRow>(
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
      WHERE event_name = 'Liquidate'
      ORDER BY block_number DESC, log_index DESC
      LIMIT 20
      `,
    );
    const hourlyActivity = await query<HourlyActivityRow>(
      `
      SELECT
        to_char(${bucketExpr}, '${formatMask}') AS bucket,
        COUNT(*)::text AS count
      FROM pool_activity
      WHERE created_at >= NOW() - ${intervalSql}
      GROUP BY ${bucketExpr}
      ORDER BY ${bucketExpr} ASC
      `,
    );
    const marketSeries = await query<MarketSeriesRow>(
      `
      SELECT
        to_char(${bucketExpr}, '${formatMask}') AS bucket,
        AVG(oracle_price_base_units)::text AS oracle_price_base_units,
        AVG(fr_nav_base_units)::text AS fr_nav_base_units
      FROM pool_market_snapshots
      WHERE observed_at >= NOW() - ${intervalSql}
      GROUP BY ${bucketExpr}
      ORDER BY ${bucketExpr} ASC
      `,
    );

    return NextResponse.json({
      protocolEventCounts: protocolEventCounts.rows.map((r) => ({
        event: r.event_name,
        count: Number(r.count),
      })),
      recentProtocolActivity: recentProtocolActivity.rows,
      liquidationRecords: liquidationRecords.rows,
      hourlyActivity: hourlyActivity.rows.map((r) => ({
        hour: r.bucket,
        count: Number(r.count),
      })),
      marketSeries: marketSeries.rows.map((r) => ({
        hour: r.bucket,
        oraclePriceBaseUnits: r.oracle_price_base_units,
        frNavBaseUnits: r.fr_nav_base_units,
      })),
      range,
      notes: "Protocol analytics from indexed on-chain events and market snapshots.",
    });
  } catch (error) {
    console.error("protocol analytics error", error);
    return NextResponse.json(
      { error: "Failed to load protocol analytics. Check DATABASE_URL and DB schema." },
      { status: 500 },
    );
  }
}

