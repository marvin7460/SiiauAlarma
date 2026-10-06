import type { PollSchedule } from "@haycupo/core";
import { siiauGateway, type Database } from "@haycupo/db";
import type { EmailTransport, TelegramClient, VapidConfig } from "@haycupo/notify";
import { eq } from "drizzle-orm";

import type { Config } from "./config";
import { dispatchNotifications, type DispatchDeps, type DispatchSummary } from "./dispatch";
import type { SiiauGateway } from "./gateway";
import { isPurgeMinute, purgeOldData } from "./retention";
import { expireAlerts, runPollCycle, type PollDeps, type RunSummary } from "./poll";

export interface JobContext {
  db: Database;
  gateway: SiiauGateway;
  config: Config;
  email: EmailTransport | null;
  telegram: TelegramClient | null;
  vapid: VapidConfig | null;
}

/** Leaves room under the one-minute schedule so runs do not pile up. */
const RUN_BUDGET_MS = 50_000;

export function scheduleFrom(config: Config): PollSchedule {
  return {
    normalMs: config.POLL_INTERVAL_SECONDS * 1000,
    registrationMs: config.POLL_REGISTRATION_INTERVAL_SECONDS * 1000,
    unpublishedMs: config.POLL_UNPUBLISHED_INTERVAL_SECONDS * 1000,
    maxBackoffMs: 60 * 60_000,
  };
}

export function pollDeps(context: JobContext): PollDeps {
  return {
    db: context.db,
    gateway: context.gateway,
    schedule: scheduleFrom(context.config),
    cooldownMs: context.config.NOTIFY_COOLDOWN_MINUTES * 60_000,
  };
}

export function dispatchDeps(context: JobContext): DispatchDeps {
  return {
    db: context.db,
    email: context.email,
    telegram: context.telegram,
    vapid: context.vapid,
    appUrl: context.config.APP_URL,
    appSecret: context.config.APP_SECRET,
    emailDailyLimit: context.config.EMAIL_DAILY_LIMIT,
  };
}

/**
 * A whole run: poll due subjects (up to POLL_MAX_SUBJECTS_PER_RUN, while `budgetMs` lasts),
 * then send what they produced.
 */
export async function runCycle(
  context: JobContext,
  { budgetMs = RUN_BUDGET_MS }: { budgetMs?: number } = {},
): Promise<RunSummary & { dispatched: DispatchSummary }> {
  const summary = await runPollCycle(pollDeps(context), {
    maxSubjects: context.config.POLL_MAX_SUBJECTS_PER_RUN,
    budgetMs,
  });
  const dispatched = await dispatchNotifications(dispatchDeps(context), { limit: 30 });
  await purgeIfDue(context.db, new Date());
  return { ...summary, dispatched };
}

/** Once an hour, delete what is past its retention period (see retention.ts). */
export async function purgeIfDue(db: Database, at: Date): Promise<void> {
  if (!isPurgeMinute(at)) return;
  try {
    await purgeOldData(db, at);
  } catch (error) {
    // Never let housekeeping break polling; the next hour tries again.
    console.error("Purge failed", error);
  }
}

export { expireAlerts };

/** Emergency brake: stop (or resume) every request to SIIAU. */
export async function setBrake(
  db: Database,
  input: { action: "pause"; minutes: number; reason: string } | { action: "resume" },
): Promise<void> {
  if (input.action === "resume") {
    await db
      .update(siiauGateway)
      .set({ pausedUntil: null, pauseReason: null, consecutiveFailures: 0, trips: 0 })
      .where(eq(siiauGateway.id, 1));
    return;
  }
  await db
    .update(siiauGateway)
    .set({
      pausedUntil: new Date(Date.now() + input.minutes * 60_000),
      pauseReason: `pausa manual: ${input.reason}`,
    })
    .where(eq(siiauGateway.id, 1));
}
