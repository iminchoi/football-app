import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.ts";

export type PitchTradeDb = PostgresJsDatabase<typeof schema>;

interface GlobalDbRegistry {
  __pitchTradeSql?: Sql;
  __pitchTradeDb?: PitchTradeDb;
  __pitchTradeDbUrl?: string;
}

const globalRegistry = globalThis as typeof globalThis & GlobalDbRegistry;

/**
 * Check whether a PostgreSQL connection string is configured via `DATABASE_URL`.
 * Returns `false` in unconfigured local/test environments so repositories safely fall back to memory.
 */
export function isDatabaseConfigured(
  rawUrl: string | undefined = process.env.DATABASE_URL
): boolean {
  const clean = (rawUrl ?? "").trim();
  if (!clean) return false;
  return /^postgres(?:ql)?:\/\/.+/i.test(clean);
}

/**
 * Return a singleton Drizzle + postgres.js client safe for Next.js HMR and serverless runtimes.
 * Uses `prepare: false` for full compatibility with Supabase Transaction Pooler (port 6543 / PgBouncer).
 * Returns `null` without opening a socket or throwing when `DATABASE_URL` is unset.
 */
export function getDb(
  rawUrl: string | undefined = process.env.DATABASE_URL
): PitchTradeDb | null {
  if (!isDatabaseConfigured(rawUrl)) {
    return null;
  }

  const connectionString = (rawUrl ?? "").trim();
  if (
    globalRegistry.__pitchTradeDb &&
    globalRegistry.__pitchTradeDbUrl === connectionString
  ) {
    return globalRegistry.__pitchTradeDb;
  }

  const sql = postgres(connectionString, {
    // Required for Supabase Transaction Pooler (PgBouncer port 6543)
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 5 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(sql, { schema });
  globalRegistry.__pitchTradeSql = sql;
  globalRegistry.__pitchTradeDb = db;
  globalRegistry.__pitchTradeDbUrl = connectionString;

  return db;
}

export async function closeDbForTesting(): Promise<void> {
  const sql = globalRegistry.__pitchTradeSql;
  globalRegistry.__pitchTradeSql = undefined;
  globalRegistry.__pitchTradeDb = undefined;
  globalRegistry.__pitchTradeDbUrl = undefined;
  if (sql) {
    await sql.end({ timeout: 2 });
  }
}

export { schema };
