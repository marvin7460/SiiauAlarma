import "server-only";

import path from "node:path";

import { runMigrations } from "@haycupo/db/migrate";
import { isServerless, runCycle, startScheduler, type Scheduler } from "@haycupo/engine";

import { getConfig, getEngine } from "@/lib/engine";

const globalForScheduler = globalThis as typeof globalThis & { haycupoScheduler?: Scheduler };

/**
 * Server startup. Everything runs in this one Next.js process: there is no separate worker.
 *
 * 1. Migrations, so the schema is current before the first request.
 * 2. The scheduler: every minute it polls the subjects that are due (the gateway paces the
 *    requests to SIIAU), sends what that produced and, once an hour, deletes expired data.
 *    SCHEDULER_ENABLED=false turns it off (end-to-end tests trigger polls by hand).
 *
 * On Netlify (serverless) neither runs here: a function is frozen between requests, so the
 * deploy workflow applies migrations and a scheduled function polls
 * (netlify/functions/poll.mts).
 */
export async function startServer(): Promise<void> {
  const config = getConfig();
  if (isServerless(process.env)) return;

  if (config.MIGRATE_ON_START) {
    // In development and `next start`, the working directory is apps/web; the Docker image
    // sets MIGRATIONS_DIR to its copy of the migrations.
    const folder =
      config.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/migrations");
    await runMigrations(
      { url: config.TURSO_DATABASE_URL, authToken: config.TURSO_AUTH_TOKEN },
      folder,
    );
  }

  if (config.SCHEDULER_ENABLED && !globalForScheduler.haycupoScheduler) {
    const { context } = getEngine();
    globalForScheduler.haycupoScheduler = startScheduler(async () => {
      const summary = await runCycle(context);
      if (summary.outcomes.length > 0 || summary.dispatched.sent > 0) {
        console.log(
          `poll: ${String(summary.outcomes.length)} subject(s), ${String(summary.dispatched.sent)} message(s) sent`,
        );
      }
    });
    console.log("Scheduler started: polling SIIAU every minute.");
  }
}
