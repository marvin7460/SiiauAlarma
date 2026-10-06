import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Daily counters for the public metrics. Aggregates only: deleting an account removes the
 * person's data but not "N notifications were sent that day". Days are UTC, like Resend's quota.
 */
export const metricsDaily = sqliteTable("metrics_daily", {
  /** "2027-01-11" (UTC). */
  day: text("day").primaryKey(),
  alertsCreated: integer("alerts_created").notNull().default(0),
  seatsOpened: integer("seats_opened").notNull().default(0),
  emailsSent: integer("emails_sent").notNull().default(0),
  telegramSent: integer("telegram_sent").notNull().default(0),
  pushSent: integer("push_sent").notNull().default(0),
  /** Searches answered (from the cache or from SIIAU). */
  searches: integer("searches").notNull().default(0),
});
