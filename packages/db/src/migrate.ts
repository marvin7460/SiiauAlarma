import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { ensureLocalFolder, type DbConfig } from "./client";

// path.join, not `new URL("../migrations", import.meta.url)`: bundlers treat that pattern as a
// file to bundle, and a folder is not one. Bundled servers pass their own folder instead.
export const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/**
 * Applies pending migrations. The web app runs this when it starts (before taking requests),
 * and `pnpm --filter @haycupo/db migrate` runs it by hand. `folder` lets a bundled server point
 * at a copy of the migrations (see the Dockerfile).
 */
export async function runMigrations(config: DbConfig, folder = MIGRATIONS_FOLDER): Promise<void> {
  ensureLocalFolder(config.url);
  const client = createClient(config);
  try {
    await migrate(drizzle({ client }), { migrationsFolder: folder });
  } finally {
    client.close();
  }
}
