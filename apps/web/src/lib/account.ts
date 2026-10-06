import "server-only";

import {
  alerts,
  loginTokens,
  notifications,
  pushSubscriptions,
  users,
  watchedSubjects,
} from "@haycupo/db";
import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "./db";

/**
 * Deletes the account and everything tied to it: sessions, alerts, sent-message log, Telegram
 * link and push subscriptions go with the user row (ON DELETE CASCADE); sign-in links are keyed
 * by email, so they are deleted explicitly. Daily aggregate counters stay: they say nothing
 * about anyone.
 */
export async function deleteAccount(userId: string, email: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(loginTokens).where(eq(loginTokens.email, email));
    await tx.delete(users).where(eq(users.id, userId));
  });
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
