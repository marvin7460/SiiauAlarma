import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getTableName, is, sql } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";

import { createDb, runBatch, type Database, type DbHandle } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

/**
 * A real SQLite database (the engine behind Turso) in a temporary file, with every migration
 * applied. A file and not `:memory:`: libSQL opens a new connection after each transaction,
 * and a new in-memory connection would be an empty database. Create one per test file and call
 * `resetTestDb` between tests. For tests only.
 */
export async function createTestDb(): Promise<DbHandle & { url: string }> {
  const file = path.join(tmpdir(), `haycupo-test-${randomUUID()}.db`);
  const config = { url: `file:${file}` };
  await runMigrations(config);
  const handle = createDb(config);
  return {
    ...handle,
    url: config.url,
    close: async () => {
      await handle.close();
      await Promise.all(
        ["", "-wal", "-shm", "-journal"].map((suffix) => rm(file + suffix, { force: true })),
      );
    },
  };
}

/** Empties every table and puts the singleton rows back to their initial state. */
export async function resetTestDb(db: Database): Promise<void> {
  // Tables that point to others first, so foreign keys (enforced on local files) never block.
  const tables = Object.values(schema)
    .flatMap((value) => (is(value, SQLiteTable) ? [value] : []))
    .sort((a, b) => getTableConfig(b).foreignKeys.length - getTableConfig(a).foreignKeys.length)
    .map((table) => getTableName(table));
  await runBatch(db, [
    ...tables.map((table) => db.run(sql.raw(`DELETE FROM "${table}"`))),
    // Restart autoincrement ids, like a fresh database.
    db.run(sql`DELETE FROM sqlite_sequence`),
    db.insert(schema.siiauGateway).values({ id: 1 }),
    db.insert(schema.pollerState).values({ id: 1 }),
  ]);
}
