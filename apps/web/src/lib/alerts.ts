import "server-only";

import { alertExpiresAt, type AlertFilters, type AlertKind, type Channel } from "@haycupo/core";
import {
  alerts,
  bumpMetric,
  offerSnapshots,
  registrationWindows,
  watchedSubjects,
} from "@haycupo/db";
import { verifyAlertCancel } from "@haycupo/notify";
import { and, count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import { serverEnv } from "./env";

/** Enough for a full schedule with alternatives; stops one account from watching everything. */
export const MAX_ACTIVE_ALERTS = 15;

export interface NewAlert {
  cycle: string;
  center: string;
  subjectCode: string;
  kind: AlertKind;
  nrc: string | null;
  filters: AlertFilters;
  channels: Channel[];
}

export type CreateAlertResult =
  | { ok: true; alertId: string; existing: boolean }
  | { ok: false; error: "unknown_subject" | "unknown_section" | "offer_published" | "too_many" };

/**
 * Creates an alert, checked against what SIIAU showed in the search the student just made
 * (offer_snapshots): no alerts for NRCs or subjects we have never seen. The same alert twice
 * updates the first one instead of duplicating it.
 */
export async function createAlert(userId: string, input: NewAlert): Promise<CreateAlertResult> {
  const db = getDb();
  const now = new Date();

  const [snapshot] = await db
    .select({ sections: offerSnapshots.sections, fetchedAt: offerSnapshots.fetchedAt })
    .from(offerSnapshots)
    .where(
      and(
        eq(offerSnapshots.cycle, input.cycle),
        eq(offerSnapshots.center, input.center),
        eq(offerSnapshots.queryKind, "code"),
        eq(offerSnapshots.queryValue, input.subjectCode),
      ),
    );
  const sections = snapshot?.fetchedAt ? (snapshot.sections ?? []) : null;
  if (!sections) return { ok: false, error: "unknown_subject" };
  if (input.kind === "section" && !sections.some((section) => section.nrc === input.nrc)) {
    return { ok: false, error: "unknown_section" };
  }
  if (input.kind === "offer" && sections.length > 0) return { ok: false, error: "offer_published" };
  if (input.kind !== "offer" && sections.length === 0)
    return { ok: false, error: "unknown_subject" };

  const [subject] = await db
    .insert(watchedSubjects)
    .values({
      cycle: input.cycle,
      center: input.center,
      subjectCode: input.subjectCode,
      subjectName: sections[0]?.subjectName ?? null,
      nextPollAt: now,
    })
    .onConflictDoUpdate({
      target: [watchedSubjects.cycle, watchedSubjects.center, watchedSubjects.subjectCode],
      // A new alert should not wait an hour for the next poll of a slow subject.
      set: {
        nextPollAt: sql`least(${watchedSubjects.nextPollAt}, ${now.toISOString()}::timestamptz)`,
      },
    })
    .returning({ id: watchedSubjects.id });
  if (!subject) throw new Error("Could not register the subject");

  const [existing] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.userId, userId),
        eq(alerts.watchedSubjectId, subject.id),
        eq(alerts.kind, input.kind),
        eq(alerts.status, "active"),
        input.nrc ? eq(alerts.nrc, input.nrc) : sql`${alerts.nrc} is null`,
      ),
    );
  if (existing) {
    await db
      .update(alerts)
      .set({ filters: input.filters, channels: input.channels })
      .where(eq(alerts.id, existing.id));
    return { ok: true, alertId: existing.id, existing: true };
  }

  const [active] = await db
    .select({ total: count() })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.status, "active")));
  if ((active?.total ?? 0) >= MAX_ACTIVE_ALERTS) return { ok: false, error: "too_many" };

  const windows = await db
    .select({
      cycle: registrationWindows.cycle,
      startsAt: registrationWindows.startsAt,
      endsAt: registrationWindows.endsAt,
    })
    .from(registrationWindows);
  const [created] = await db
    .insert(alerts)
    .values({
      userId,
      watchedSubjectId: subject.id,
      kind: input.kind,
      nrc: input.kind === "section" ? input.nrc : null,
      filters: input.kind === "subject" ? input.filters : {},
      channels: input.channels,
      expiresAt: alertExpiresAt({ kind: input.kind, cycle: input.cycle, now, windows }),
    })
    .returning({ id: alerts.id });
  if (!created) throw new Error("Could not create the alert");
  await bumpMetric(db, "alertsCreated", now);
  return { ok: true, alertId: created.id, existing: false };
}

export async function listAlerts(userId: string) {
  return getDb()
    .select({
      id: alerts.id,
      kind: alerts.kind,
      nrc: alerts.nrc,
      filters: alerts.filters,
      channels: alerts.channels,
      status: alerts.status,
      createdAt: alerts.createdAt,
      expiresAt: alerts.expiresAt,
      lastNotifiedAt: alerts.lastNotifiedAt,
      notifyCount: alerts.notifyCount,
      cycle: watchedSubjects.cycle,
      center: watchedSubjects.center,
      subjectCode: watchedSubjects.subjectCode,
      subjectName: watchedSubjects.subjectName,
      lastSuccessAt: watchedSubjects.lastSuccessAt,
      lastError: watchedSubjects.lastError,
    })
    .from(alerts)
    .innerJoin(watchedSubjects, eq(watchedSubjects.id, alerts.watchedSubjectId))
    .where(eq(alerts.userId, userId))
    .orderBy(sql`${alerts.status} = 'active' desc`, desc(alerts.createdAt));
}

export type AlertListItem = Awaited<ReturnType<typeof listAlerts>>[number];

/** Cancels one of the student's own alerts. */
export async function cancelOwnAlert(userId: string, alertId: string): Promise<boolean> {
  const cancelled = await getDb()
    .update(alerts)
    .set({ status: "cancelled", endedAt: new Date() })
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, userId), eq(alerts.status, "active")))
    .returning({ id: alerts.id });
  return cancelled.length > 0;
}

/** Cancels an alert from the signed link in an email, without signing in. */
export async function cancelAlertWithSignature(
  alertId: string,
  signature: string,
): Promise<boolean> {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(alertId)) return false;
  if (!(await verifyAlertCancel(serverEnv().APP_SECRET, alertId, signature))) return false;
  await getDb()
    .update(alerts)
    .set({ status: "cancelled", endedAt: new Date() })
    .where(and(eq(alerts.id, alertId), eq(alerts.status, "active")));
  return true;
}

/** Summary of an alert for the confirmation page of a signed cancel link. */
export async function alertSummary(alertId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(alertId)) return null;
  const [row] = await getDb()
    .select({
      kind: alerts.kind,
      nrc: alerts.nrc,
      filters: alerts.filters,
      status: alerts.status,
      subjectCode: watchedSubjects.subjectCode,
      subjectName: watchedSubjects.subjectName,
    })
    .from(alerts)
    .innerJoin(watchedSubjects, eq(watchedSubjects.id, alerts.watchedSubjectId))
    .where(eq(alerts.id, alertId));
  return row ?? null;
}
