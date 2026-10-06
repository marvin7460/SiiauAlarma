import { PGlite } from "@electric-sql/pglite";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database, DbHandle } from "./client";
import { MIGRATIONS_FOLDER } from "./migrate";
import * as schema from "./schema";

/**
 * A real Postgres (PGlite, compiled to WebAssembly) in memory, with every migration applied.
 * Each call is a fresh, isolated database. Starting one takes a moment, so create it once per
 * test file and call `resetTestDb` between tests. For tests only.
 */
export async function createTestDb(): Promise<DbHandle> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}

/** Empties every table and puts the gateway row back to its initial state. */
export async function resetTestDb(db: Database): Promise<void> {
  const tables = Object.values(schema).flatMap((value) =>
    is(value, PgTable) ? [`"${getTableName(value)}"`] : [],
  );
  await db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
  await db.insert(schema.siiauGateway).values({ id: 1 });
}
