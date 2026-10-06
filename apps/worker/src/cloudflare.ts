/**
 * Cloudflare Workers entry point. Each invocation opens its own database connection (Workers
 * cannot keep sockets between requests) and closes it when done.
 *
 * Cron (every minute): with POLL_MODE=fanout the cron invocation only orchestrates. It asks
 * this same Worker, through the SELF service binding, to poll one subject per call, so every
 * subject gets a fresh invocation with its own CPU budget (10 ms on the free plan; parsing a
 * typical subject takes ~2–3 ms). The gateway still serializes and paces requests to SIIAU.
 */
import { createDb, pollerState } from "@haycupo/db";
import { eq } from "drizzle-orm";

import { createApp } from "./app";
import { parseConfig, type Config } from "./config";
import { dispatchNotifications } from "./dispatch";
import { dispatchDeps, expireAlerts, purgeIfDue, runCycle } from "./jobs";

interface Env extends Record<string, unknown> {
  SELF?: Fetcher;
}

const RUN_BUDGET_MS = 50_000;

async function fanOut(env: Env, config: Config): Promise<void> {
  const { db, close } = createDb(config.DATABASE_URL, { max: 1 });
  const app = createApp(config, db);
  const startedAt = new Date();
  let polled = 0;
  let runError: string | null = null;
  try {
    await db.update(pollerState).set({ lastRunStartedAt: startedAt }).where(eq(pollerState.id, 1));
    await expireAlerts(db, startedAt);
    while (
      polled < config.POLL_MAX_SUBJECTS_PER_RUN &&
      Date.now() - startedAt.getTime() < RUN_BUDGET_MS
    ) {
      const response = await env.SELF?.fetch("https://worker/internal/poll-one", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.INTERNAL_API_TOKEN}` },
      });
      if (!response?.ok) throw new Error(`poll-one answered ${String(response?.status)}`);
      const body: { outcome: { status: string } | null } = await response.json();
      if (!body.outcome) break;
      polled += 1;
      if (body.outcome.status === "deferred") break;
    }
    // Retries and anything left behind by an interrupted invocation.
    await dispatchNotifications(dispatchDeps(app.context), { limit: 20 });
    await purgeIfDue(db, startedAt);
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error);
    console.error("Fan-out run failed", error);
  } finally {
    await db
      .update(pollerState)
      .set({ lastRunFinishedAt: new Date(), lastRunSubjects: polled, lastRunError: runError })
      .where(eq(pollerState.id, 1));
    await close();
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const config = parseConfig(env);
    const { db, close } = createDb(config.DATABASE_URL, { max: 1 });
    try {
      return await createApp(config, db).handle(request);
    } finally {
      ctx.waitUntil(close());
    }
  },

  scheduled(_controller, env, ctx): void {
    const config = parseConfig(env);
    if (config.POLL_MODE === "fanout" && env.SELF) {
      ctx.waitUntil(fanOut(env, config));
      return;
    }
    const { db, close } = createDb(config.DATABASE_URL, { max: 1 });
    ctx.waitUntil(
      runCycle(createApp(config, db).context)
        .catch((error: unknown) => {
          console.error("Poll run failed", error);
        })
        .finally(() => close()),
    );
  },
} satisfies ExportedHandler<Env>;
