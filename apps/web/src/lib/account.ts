import "server-only";

import {
  alerts,
  loginTokens,
  notifications,
  pushSubscriptions,
  runBatch,
  sessions,
  telegramLinkTokens,
  users,
  watchedSubjects,
} from "@haycupo/db";
import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "./db";

/**
 * Deletes the account and everything tied to it, in one atomic batch: sent-message log, alerts,
 * push subscriptions, Telegram link codes, sessions, sign-in links, then the user. Each table
 * explicitly: nothing cascades on its own (see createDb in packages/db). Daily aggregate
 * counters stay: they say nothing about anyone.
 */
export async function deleteAccount(userId: string, email: string): Promise<void> {
  const db = getDb();
  await runBatch(db, [
    db.delete(notifications).where(eq(notifications.userId, userId)),
    db.delete(alerts).where(eq(alerts.userId, userId)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.userId, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    db.delete(loginTokens).where(eq(loginTokens.email, email)),
    db.delete(users).where(eq(users.id, userId)),
  ]);
}

/** Everything stored about the student, for "Descargar mis datos" (right of access). */
export async function exportAccountData(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const [alertRows, devices, sent] = await Promise.all([
    db
      .select({
        id: alerts.id,
        kind: alerts.kind,
        cycle: watchedSubjects.cycle,
        center: watchedSubjects.center,
        subjectCode: watchedSubjects.subjectCode,
        nrc: alerts.nrc,
        filters: alerts.filters,
        channels: alerts.channels,
        status: alerts.status,
        createdAt: alerts.createdAt,
        expiresAt: alerts.expiresAt,
        endedAt: alerts.endedAt,
        notifyCount: alerts.notifyCount,
      })
      .from(alerts)
      .innerJoin(watchedSubjects, eq(watchedSubjects.id, alerts.watchedSubjectId))
      .where(eq(alerts.userId, userId))
      .orderBy(asc(alerts.createdAt)),
    db
      .select({
        endpoint: pushSubscriptions.endpoint,
        createdAt: pushSubscriptions.createdAt,
        lastSuccessAt: pushSubscriptions.lastSuccessAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId)),
    db
      .select({
        alertId: notifications.alertId,
        channel: notifications.channel,
        status: notifications.status,
        createdAt: notifications.createdAt,
        sentAt: notifications.sentAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      createdAt: user.createdAt,
      emailNotifications: user.emailNotifications,
      telegramChatId: user.telegramChatId,
      telegramLinkedAt: user.telegramLinkedAt,
    },
    alerts: alertRows,
    // The endpoint's host says which push service (Google, Mozilla, Apple); the rest of the
    // URL and the keys work like a password for that device, so they are left out.
    pushDevices: devices.map((device) => ({
      service: new URL(device.endpoint).hostname,
      createdAt: device.createdAt,
      lastSuccessAt: device.lastSuccessAt,
    })),
    messages: sent,
  };
}
