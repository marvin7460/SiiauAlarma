import { eq, sql } from "drizzle-orm";

import type { Database } from "./client";
import { metricsDaily } from "./schema";

export type MetricColumn =
  "alertsCreated" | "seatsOpened" | "emailsSent" | "telegramSent" | "pushSent" | "searches";

/** "2027-01-11": UTC days, like Resend's daily quota. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds to a daily counter (aggregates only, never who). */
export async function bumpMetric(
  db: Database,
  column: MetricColumn,
  now: Date,
  amount = 1,
): Promise<void> {
  if (amount === 0) return;
  const target = metricsDaily[column];
  await db
    .insert(metricsDaily)
    .values({ day: utcDay(now), [column]: amount })
    .onConflictDoUpdate({
      target: metricsDaily.day,
      set: { [column]: sql`${target} + ${amount}` },
    });
}

/** Emails sent today (UTC), for Resend's daily quota. Sign-in links count too. */
export async function emailsSentToday(db: Database, now: Date): Promise<number> {
  const [row] = await db
    .select({ sent: metricsDaily.emailsSent })
    .from(metricsDaily)
    .where(eq(metricsDaily.day, utcDay(now)));
  return row?.sent ?? 0;
}
