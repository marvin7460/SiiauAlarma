import type { Channel } from "@haycupo/core";
import {
  bumpMetric,
  emailsSentToday,
  notifications,
  pushSubscriptions,
  users,
  type Database,
} from "@haycupo/db";
import {
  EmailSendError,
  PushError,
  TelegramError,
  buildAlertLinks,
  isKnownPushService,
  offerPublishedEmail,
  offerPublishedPush,
  offerPublishedTelegram,
  seatOpenedEmail,
  seatOpenedPush,
  seatOpenedTelegram,
  sendPush,
  type AlertLinks,
  type EmailTransport,
  type TelegramClient,
  type VapidConfig,
} from "@haycupo/notify";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

type NotificationRow = typeof notifications.$inferSelect;

export interface DispatchDeps {
  db: Database;
  email: EmailTransport | null;
  telegram?: TelegramClient | null;
  vapid?: VapidConfig | null;
  /** For push requests; tests pass a fake. */
  pushFetch?: typeof fetch;
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

/** Push subscriptions that failed this many times in a row are dropped. */
const MAX_PUSH_FAILURES = 5;

function linksFor(deps: DispatchDeps, row: NotificationRow): Promise<AlertLinks> {
  return buildAlertLinks({
    appUrl: deps.appUrl,
    secret: deps.appSecret,
    alertId: row.payload.alert.id,
    subject: row.payload.subject,
  });
}

async function deliverTelegram(
  deps: DispatchDeps,
  row: NotificationRow,
  at: Date,
): Promise<Result> {
  if (!deps.telegram) return { outcome: "skipped", reason: "telegram channel not configured" };
  const [user] = await deps.db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, row.userId));
  if (!user) return { outcome: "skipped", reason: "user deleted" };
  if (user.chatId === null) return { outcome: "skipped", reason: "telegram not linked" };

  const links = await linksFor(deps, row);
  const text =
    row.payload.reason === "offer_published"
      ? offerPublishedTelegram(row.payload, links)
      : seatOpenedTelegram(row.payload, links);
  try {
    await deps.telegram.sendMessage(user.chatId, text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof TelegramError && error.chatGone) {
      // The student blocked the bot: stop trying that chat.
      await deps.db
        .update(users)
        .set({ telegramChatId: null, telegramLinkedAt: null })
        .where(eq(users.id, row.userId));
      return { outcome: "failed", reason };
    }
    const retryable = !(error instanceof TelegramError) || error.retryable;
    return retryable ? { outcome: "retry", reason } : { outcome: "failed", reason };
  }
  await bumpMetric(deps.db, "telegramSent", at);
  return { outcome: "sent" };
}

/** Sends to every browser the student enabled; one that works is enough. */
async function deliverPush(deps: DispatchDeps, row: NotificationRow, at: Date): Promise<Result> {
  if (!deps.vapid) return { outcome: "skipped", reason: "push channel not configured" };
  const subscriptions = await deps.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, row.userId));
  if (subscriptions.length === 0) return { outcome: "skipped", reason: "no push subscriptions" };

  const links = await linksFor(deps, row);
  const data =
    row.payload.reason === "offer_published"
      ? offerPublishedPush(row.payload, links)
      : seatOpenedPush(row.payload, links);
  let delivered = 0;
  let retryable = false;
  let lastReason = "";
  for (const subscription of subscriptions) {
    if (!isKnownPushService(subscription.endpoint)) {
      // apps/web refuses these; never POST to an arbitrary server if one slips in.
      await deps.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      lastReason = "unknown push service";
      continue;
    }
    try {
      await sendPush(subscription, data, deps.vapid, deps.pushFetch);
      delivered += 1;
      await deps.db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: at, failureCount: 0 })
        .where(eq(pushSubscriptions.id, subscription.id));
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      const gone = error instanceof PushError && error.gone;
      if (!(error instanceof PushError) || error.retryable) retryable = true;
      if (gone || subscription.failureCount + 1 >= MAX_PUSH_FAILURES) {
        await deps.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      } else {
        await deps.db
          .update(pushSubscriptions)
          .set({ failureCount: subscription.failureCount + 1 })
          .where(eq(pushSubscriptions.id, subscription.id));
      }
    }
  }
  if (delivered > 0) {
    await bumpMetric(deps.db, "pushSent", at);
    return { outcome: "sent" };
  }
  return retryable
    ? { outcome: "retry", reason: lastReason }
    : { outcome: "failed", reason: lastReason };
}

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
  const links = await linksFor(deps, row);
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

async function deliver(deps: DispatchDeps, row: NotificationRow, at: Date): Promise<Result> {
  const channel: Channel = row.channel;
  switch (channel) {
    case "email":
      return deliverEmail(deps, row, at);
    case "telegram":
      return deliverTelegram(deps, row, at);
    case "push":
      return deliverPush(deps, row, at);
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
