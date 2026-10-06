import { alerts, metricsDaily, users, utcDay, type Database } from "@haycupo/db";
import { asc, count, countDistinct, eq, gte, sum } from "drizzle-orm";

/**
 * Public impact numbers. Everything comes from daily aggregates and counts: no visitor
 * tracking, no cookies, nothing about who did what. (This file takes the database as a
 * parameter, without "server-only", so it can be tested against PGlite.)
 */

export interface DailyPoint {
  day: string;
  seatsOpened: number;
  notifications: number;
}

export interface Impact {
  totals: {
    searches: number;
    alertsCreated: number;
    seatsOpened: number;
    notifications: number;
  };
  now: { activeAlerts: number; watchedSubjects: number; accounts: number };
  lastDays: DailyPoint[];
  averageMinutesToSeat: number | null;
}

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);

export async function getImpact(db: Database, today = new Date(), days = 30): Promise<Impact> {
  const since = utcDay(new Date(today.getTime() - (days - 1) * 24 * 60 * 60_000));
  const [[totals], [active], [accounts], rows, average] = await Promise.all([
    db
      .select({
        searches: sum(metricsDaily.searches),
        alertsCreated: sum(metricsDaily.alertsCreated),
        seatsOpened: sum(metricsDaily.seatsOpened),
        emails: sum(metricsDaily.emailsSent),
        telegram: sum(metricsDaily.telegramSent),
        push: sum(metricsDaily.pushSent),
      })
      .from(metricsDaily),
    db
      .select({ alerts: count(), subjects: countDistinct(alerts.watchedSubjectId) })
      .from(alerts)
      .where(eq(alerts.status, "active")),
    db.select({ total: count() }).from(users),
    db
      .select()
      .from(metricsDaily)
      .where(gte(metricsDaily.day, since))
      .orderBy(asc(metricsDaily.day)),
    averageMinutesToSeat(db),
  ]);

  // Every day in the range, including the ones without activity (no row).
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const lastDays: DailyPoint[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = utcDay(new Date(today.getTime() - index * 24 * 60 * 60_000));
    const row = byDay.get(day);
    lastDays.push({
      day,
      seatsOpened: row?.seatsOpened ?? 0,
      notifications: (row?.emailsSent ?? 0) + (row?.telegramSent ?? 0) + (row?.pushSent ?? 0),
    });
  }

  return {
    totals: {
      searches: toNumber(totals?.searches),
      alertsCreated: toNumber(totals?.alertsCreated),
      seatsOpened: toNumber(totals?.seatsOpened),
      // Sign-in emails count in emailsSent too; this is "messages sent", not only alerts.
      notifications: toNumber(totals?.emails) + toNumber(totals?.telegram) + toNumber(totals?.push),
    },
    now: {
      activeAlerts: active?.alerts ?? 0,
      watchedSubjects: active?.subjects ?? 0,
      accounts: accounts?.total ?? 0,
    },
    lastDays,
    averageMinutesToSeat: average,
  };
}

/**
 * How long, on average, students waited from creating an alert until the first "¡Hay cupo!"
 * (in minutes), or null if no alert has found a seat yet.
 *
 * TODO(Marvin): write this query. It is the most telling number on /impacto ("on average, a
 * seat showed up 3 h 20 min after asking"). Tests in impact.test.ts (remove `.skip`).
 * - Use `alerts.firstNotifiedAt` (set when the first notification of an alert is created) and
 *   `alerts.createdAt`.
 * - Only alerts that found a seat: `firstNotifiedAt` not null, and `kind` "section" or
 *   "subject" ("offer" alerts wait for a publication, not for a seat).
 * - Alerts are deleted 180 days after they end (see apps/worker/src/retention.ts), so this is
 *   the average of roughly the last six months. Fine for the page; say so in the text.
 * Hint: in SQL, `extract(epoch from (a - b))` gives the seconds between two timestamps; with
 * Drizzle, `db.select({ minutes: sql<string | null>\`avg(...) / 60\` }).from(alerts).where(...)`.
 * Postgres returns `avg` as a string (numeric): convert it, and keep null when there are no rows.
 */
export async function averageMinutesToSeat(_db: Database): Promise<number | null> {
  return Promise.resolve(null);
}
