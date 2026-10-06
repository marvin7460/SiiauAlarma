/**
 * pnpm --filter @haycupo/db migrate
 *
 * Reads TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for Turso) from the environment or from the
 * repository's .env.local.
 */
import { fileURLToPath } from "node:url";

import { runMigrations } from "./migrate";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("Set TURSO_DATABASE_URL (for example file:./data/local.db) to run migrations.");
  process.exit(1);
}
// `||`: an empty TURSO_AUTH_TOKEN= (as in .env.example) means "no token".
await runMigrations({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
console.log("Migrations applied.");
