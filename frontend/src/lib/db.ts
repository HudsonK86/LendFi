import { Pool, type QueryResult, type QueryResultRow } from "pg";

declare global {
  var __lendfiPgPool: Pool | undefined;
}

function getConnectionString(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable");
  }
  return databaseUrl;
}

function getPool(): Pool {
  const databaseUrl = getConnectionString();
  const pool = globalThis.__lendfiPgPool ?? new Pool({ connectionString: databaseUrl });
  if (process.env.NODE_ENV !== "production") {
    globalThis.__lendfiPgPool = pool;
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export { getPool };
