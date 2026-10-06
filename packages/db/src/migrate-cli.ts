/**
 * pnpm --filter @haycupo/db migrate
 *
 * Reads DATABASE_URL (or MIGRATION_DATABASE_URL, for a direct connection that bypasses the
 * pooler) from the environment or from the repository's .env.local.
 */
import { fileURLToPath } from "node:url";

import { runMigrations } from "./migrate";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// `||`, not `??`: an empty MIGRATION_DATABASE_URL= (as in .env.example) means "not set".
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or MIGRATION_DATABASE_URL) to run migrations.");
  process.exit(1);
}
await runMigrations(url);
console.log("Migrations applied.");
