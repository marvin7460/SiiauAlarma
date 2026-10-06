import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "./schema";

/** The database as the rest of the code sees it: Drizzle over libSQL (Turso, or a local file). */
export type Database = LibSQLDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  client: Client;
  close: () => Promise<void>;
}

export interface DbConfig {
  /** `libsql://<db>-<org>.turso.io` in production; `file:./data/local.db` for development. */
  url: string;
  /** Turso database token. Not needed for local files. */
  authToken?: string;
}

/**
 * Connects to Turso over HTTP, or opens a local SQLite file.
 *
 * Foreign keys: libSQL enforces them on local files, but on a remote connection
 * `PRAGMA foreign_keys` is per connection and does not survive between HTTP requests. So code
 * never relies on ON DELETE CASCADE: it deletes the rows that point to a row first (see
 * deleteAccount and the retention job), which works either way.
 */
export function createDb({ url, authToken }: DbConfig): DbHandle {
  ensureLocalFolder(url);
  const client = createClient({ url, authToken });
  if (url.startsWith("file:")) {
    // A local file may be shared with another process (a test runner, a script): wait for its
    // lock instead of failing at once with SQLITE_BUSY. Turso handles this on its side.
    void client.execute("PRAGMA busy_timeout = 5000");
  }
  const db = drizzle({ client, schema, casing: "snake_case" });
  return {
    db,
    client,
    close: () => {
      client.close();
      return Promise.resolve();
    },
  };
}

/** A local database file (`file:../../data/local.db`) needs its folder; SQLite will not create it. */
export function ensureLocalFolder(url: string): void {
  if (!url.startsWith("file:")) return;
  const file = url.slice("file:".length).split("?")[0] ?? "";
  if (file === "" || file === ":memory:") return;
  // Runtime-only path: tell Next.js's file tracing not to follow it (it would bundle everything).
  mkdirSync(path.dirname(path.resolve(/* turbopackIgnore: true */ file)), { recursive: true });
}

/** One statement of a batch: a Drizzle query not yet awaited. */
export type Statement = BatchItem<"sqlite">;

/**
 * Runs statements atomically, in one round trip (on Turso, one HTTP request and one
 * transaction). Prefer it over interactive transactions, which hold a write lock across
 * several network round trips. An empty list does nothing.
 */
export async function runBatch(db: Database, statements: readonly Statement[]): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) return;
  await db.batch([first, ...rest]);
}
