import { createDb } from "@haycupo/db";

import { parseConfig } from "./config";
import type { DispatchSummary } from "./dispatch";
import { createEngine } from "./engine";
import { runCycle } from "./jobs";
export { isServerless } from "./platform";
import type { RunSummary } from "./poll";

export type ScheduledRunResult =
  | { status: "skipped"; reason: string }
  | ({ status: "ran" } & RunSummary & { dispatched: DispatchSummary });

/**
 * One run of the poller from a platform's scheduler (Netlify's scheduled function): opens the
 * database, polls what is due within `budgetMs`, sends what that produced, and closes. With
 * POLL_MAX_SUBJECTS_PER_RUN=1 each run asks SIIAU once, so the run never pays for the pause
 * between requests: the next run is a minute later.
 */
export async function runScheduledRun(
  env: Record<string, string | undefined>,
  { budgetMs }: { budgetMs: number },
): Promise<ScheduledRunResult> {
  const config = parseConfig(env);
  if (!config.SCHEDULER_ENABLED) {
    return { status: "skipped", reason: "SCHEDULER_ENABLED=false (another server polls)" };
  }
  const handle = createDb({ url: config.TURSO_DATABASE_URL, authToken: config.TURSO_AUTH_TOKEN });
  try {
    const { context } = createEngine(config, { db: handle.db });
    return { status: "ran", ...(await runCycle(context, { budgetMs })) };
  } finally {
    await handle.close();
  }
}
