import type { Channel } from "@haycupo/core";
import { bumpMetric, emailsSentToday, notifications, users, type Database } from "@haycupo/db";
import {
  EmailSendError,
  buildAlertLinks,
  offerPublishedEmail,
  seatOpenedEmail,
  type EmailTransport,
} from "@haycupo/notify";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

type NotificationRow = typeof notifications.$inferSelect;

export interface DispatchDeps {
  db: Database;
  email: EmailTransport | null;
  appUrl: string;
  appSecret: string;
  emailDailyLimit: number;
  now?: () => Date;
}

export interface DispatchSummary {
  sent: number;
  failed: number;
  skipped: number;
  retrying: number;
}

const MAX_ATTEMPTS = 3;
/** A "there is a seat" message older than this is useless: the seat is surely gone. */
const STALE_AFTER_MS = 30 * 60_000;

type Result =
  | { outcome: "sent" }
  | { outcome: "skipped"; reason: string }
  | { outcome: "retry"; reason: string }
  | { outcome: "failed"; reason: string };

async function deliverEmail(deps: DispatchDeps, row: NotificationRow, at: Date): Promise<Result> {
  if (!deps.email) return { outcome: "skipped", reason: "email channel not configured" };
  const [user] = await deps.db
    .select({ email: users.email, enabled: users.emailNotifications })
    .from(users)
    .where(eq(users.id, row.userId));
  if (!user) return { outcome: "skipped", reason: "user deleted" };
  if (!user.enabled) return { outcome: "skipped", reason: "email notifications turned off" };
  if ((await emailsSentToday(deps.db, at)) >= deps.emailDailyLimit) {
    return { outcome: "skipped", reason: "daily email quota reached" };
  }

  const payload = row.payload;
  const links = await buildAlertLinks({
    appUrl: deps.appUrl,
    secret: deps.appSecret,
    alertId: payload.alert.id,
    subject: payload.subject,
  });
  const rendered =
    payload.reason === "offer_published"
      ? offerPublishedEmail(payload, links)
      : seatOpenedEmail(payload, links);
  try {
    await deps.email.send({
      to: user.email,
      ...rendered,
      headers: {
        // One-click unsubscribe (RFC 8058): mail clients show a "cancel" button.
        "List-Unsubscribe": `<${links.cancelOneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const retryable = !(error instanceof EmailSendError) || error.retryable;
    return retryable ? { outcome: "retry", reason } : { outcome: "failed", reason };
  }
  await bumpMetric(deps.db, "emailsSent", at);
  return { outcome: "sent" };
}

/** Channels added in later phases plug in here. */
async function deliver(deps: DispatchDeps, row: NotificationRow, at: Date): Promise<Result> {
  const channel: Channel = row.channel;
  switch (channel) {
    case "email":
      return deliverEmail(deps, row, at);
    case "telegram":
    case "push":
      return { outcome: "skipped", reason: `${channel} channel not configured` };
  }
}

/**
 * Sends pending notifications. Each row is claimed first (attempts + 1 and a later retry time,
 * in one UPDATE with SKIP LOCKED), so two dispatchers never send the same message.
 */
export async function dispatchNotifications(
  deps: DispatchDeps,
  options: { limit: number; onlyAlertIds?: string[] } = { limit: 20 },
): Promise<DispatchSummary> {
  const at = deps.now?.() ?? new Date();
  const due = deps.db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.status, "pending"),
        lte(notifications.nextAttemptAt, at),
        options.onlyAlertIds && options.onlyAlertIds.length > 0
          ? inArray(notifications.alertId, options.onlyAlertIds)
          : undefined,
      ),
    )
    .orderBy(asc(notifications.id))
    .limit(options.limit)
    .for("update", { skipLocked: true });
  const claimed = await deps.db
    .update(notifications)
    .set({
      attempts: sql`${notifications.attempts} + 1`,
      nextAttemptAt: new Date(at.getTime() + 5 * 60_000),
    })
    .where(inArray(notifications.id, due))
    .returning();

  const summary: DispatchSummary = { sent: 0, failed: 0, skipped: 0, retrying: 0 };
  for (const row of claimed.sort((a, b) => a.id - b.id)) {
    const result: Result =
      at.getTime() - row.createdAt.getTime() > STALE_AFTER_MS
        ? { outcome: "skipped", reason: "too old to be useful" }
        : await deliver(deps, row, at);
    switch (result.outcome) {
      case "sent":
        summary.sent += 1;
        await deps.db
          .update(notifications)
          .set({ status: "sent", sentAt: at, lastError: null })
          .where(eq(notifications.id, row.id));
        break;
      case "skipped":
        summary.skipped += 1;
        await deps.db
          .update(notifications)
          .set({ status: "skipped", lastError: result.reason })
          .where(eq(notifications.id, row.id));
        break;
      case "retry":
      case "failed": {
        const giveUp = result.outcome === "failed" || row.attempts >= MAX_ATTEMPTS;
        if (giveUp) summary.failed += 1;
        else summary.retrying += 1;
        await deps.db
          .update(notifications)
          .set({
            status: giveUp ? "failed" : "pending",
            lastError: result.reason,
            nextAttemptAt: new Date(at.getTime() + row.attempts * 60_000),
          })
          .where(eq(notifications.id, row.id));
        break;
      }
    }
  }
  return summary;
}
