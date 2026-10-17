/**
 * pnpm --filter @haycupo/db migrate [--if-production]
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
// --if-production: the Netlify build applies pending migrations before publishing, so new code
// never meets an old database. Only for production deploys (Netlify sets CONTEXT): a pull
// request's preview must not change the real database before the change is approved. CI's
// offline build has no remote database: nothing to do there either.
if (process.argv.includes("--if-production")) {
  const context = process.env.CONTEXT;
  if (context !== undefined && context !== "production") {
    console.log(`Netlify ${context} build: migrations only run on production deploys.`);
    process.exit(0);
  }
  if (!/^(libsql|https|wss):\/\//.test(url ?? "")) {
    console.log("No remote database (TURSO_DATABASE_URL): migrations skipped.");
    process.exit(0);
  }
}
if (!url) {
  console.error("Set TURSO_DATABASE_URL (for example file:./data/local.db) to run migrations.");
  process.exit(1);
}
// `||`: an empty TURSO_AUTH_TOKEN= (as in .env.example) means "no token".
await runMigrations({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
console.log("Migrations applied.");
