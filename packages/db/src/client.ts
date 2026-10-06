import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * The database as the rest of the code sees it. Production uses postgres.js; tests use PGlite.
 * Both are Drizzle `PgDatabase`s, so queries are written once.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Database;
  /** Closes the connection. On Cloudflare Workers call it at the end of every invocation. */
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Pool size. Serverless functions and Workers want 1–2. */
  max?: number;
}

/**
 * Connects with postgres.js. `prepare: false` is required by Supabase's transaction pooler
 * (port 6543), which is what serverless functions should use.
 */
export function createDb(url: string, { max = 3 }: CreateDbOptions = {}): DbHandle {
  const client = postgres(url, { max, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}
