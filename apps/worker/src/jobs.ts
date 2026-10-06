import type { PollSchedule } from "@haycupo/core";
import { siiauGateway, type Database } from "@haycupo/db";
import type { EmailTransport } from "@haycupo/notify";
import { eq } from "drizzle-orm";

import type { Config } from "./config";
import { dispatchNotifications, type DispatchDeps, type DispatchSummary } from "./dispatch";
import type { SiiauGateway } from "./gateway";
import {
  claimDueSubject,
  expireAlerts,
  loadRegistrationWindows,
  pollSubject,
  runPollCycle,
  type PollDeps,
  type PollOutcome,
  type RunSummary,
} from "./poll";

export interface JobContext {
  db: Database;
  gateway: SiiauGateway;
  config: Config;
  email: EmailTransport | null;
}

/** Leaves room under a one-minute cron so runs do not pile up. */
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
    appUrl: context.config.APP_URL,
    appSecret: context.config.APP_SECRET,
    emailDailyLimit: context.config.EMAIL_DAILY_LIMIT,
  };
}

/** A whole run in this process: poll due subjects, then send what they produced. */
export async function runCycle(
  context: JobContext,
): Promise<RunSummary & { dispatched: DispatchSummary }> {
  const summary = await runPollCycle(pollDeps(context), {
    maxSubjects: context.config.POLL_MAX_SUBJECTS_PER_RUN,
    budgetMs: RUN_BUDGET_MS,
  });
  const dispatched = await dispatchNotifications(dispatchDeps(context), { limit: 30 });
  return { ...summary, dispatched };
}

/**
 * Polls the single most overdue subject and sends its notifications. On Cloudflare, the cron
 * calls this once per subject through a service binding, so each subject gets its own
 * invocation (and its own CPU budget).
 */
export async function pollOne(
  context: JobContext,
): Promise<{ outcome: PollOutcome | null; dispatched: DispatchSummary | null }> {
  const subject = await claimDueSubject(context.db, new Date());
  if (!subject) return { outcome: null, dispatched: null };
  const windows = await loadRegistrationWindows(context.db);
  const outcome = await pollSubject(pollDeps(context), subject, windows);
  const dispatched =
    outcome.status === "polled" && outcome.notifications > 0
      ? await dispatchNotifications(dispatchDeps(context), { limit: 20 })
      : null;
  return { outcome, dispatched };
}

export { expireAlerts };

/** Emergency brake: stop (or resume) every request to SIIAU, from any process. */
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
