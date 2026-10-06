import "server-only";

import { createDb, type DbHandle } from "@haycupo/db";

import { serverEnv } from "./env";

const globalForDb = globalThis as typeof globalThis & { haycupoDb?: DbHandle };

/**
 * One small pool per server instance. In development, hot reloads would open a new pool on
 * every change, so it is kept on globalThis.
 */
export function getDb(): DbHandle["db"] {
  globalForDb.haycupoDb ??= createDb(serverEnv().DATABASE_URL, { max: 2 });
  return globalForDb.haycupoDb.db;
}
