import "server-only";

import type { Database } from "@haycupo/db";

import { getEngine } from "./engine";

/** The database client of this server process (Turso, or a local file in development). */
export function getDb(): Database {
  return getEngine().context.db;
}
