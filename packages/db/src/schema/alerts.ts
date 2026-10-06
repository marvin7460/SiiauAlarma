import type { AlertFilters, AlertKind, Channel, NotificationPayload } from "@haycupo/core";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { users } from "./accounts";
import { boolean, json, nowMs, timestamp, uuidPrimaryKey } from "./columns";

/**
 * A (cycle, campus, subject) that at least one alert watches. The poller works per subject,
 * not per student: one request to SIIAU serves every alert on the subject.
 */
export const watchedSubjects = sqliteTable(
  "watched_subjects",
  {
    id: uuidPrimaryKey(),
    cycle: text("cycle").notNull(),
    center: text("center").notNull(),
    subjectCode: text("subject_code").notNull(),
    subjectName: text("subject_name"),
    /** Whether SIIAU has any section for it; null until the first successful poll. */
    published: boolean("published"),
    nextPollAt: timestamp("next_poll_at").notNull().default(nowMs),
    lastPolledAt: timestamp("last_polled_at"),
    /** Set once the first poll succeeded: from then on, changes are news. */
    lastSuccessAt: timestamp("last_success_at"),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at").notNull().default(nowMs),
  },
  (table) => [
    uniqueIndex("watched_subjects_key").on(table.cycle, table.center, table.subjectCode),
    index("watched_subjects_next_poll_at_idx").on(table.nextPollAt),
  ],
);

/** Free seats per section at the last successful poll; what the next poll compares against. */
export const sectionStates = sqliteTable(
  "section_states",
  {
    watchedSubjectId: text("watched_subject_id")
      .notNull()
      .references(() => watchedSubjects.id, { onDelete: "cascade" }),
    nrc: text("nrc").notNull(),
    available: integer("available").notNull(),
    capacity: integer("capacity").notNull(),
    updatedAt: timestamp("updated_at").notNull().default(nowMs),
  },
  (table) => [primaryKey({ columns: [table.watchedSubjectId, table.nrc] })],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: uuidPrimaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    watchedSubjectId: text("watched_subject_id")
      .notNull()
      .references(() => watchedSubjects.id, { onDelete: "restrict" }),
    kind: text("kind").$type<AlertKind>().notNull(),
    /** Only for kind = "section". */
    nrc: text("nrc"),
    filters: json<AlertFilters>("filters")
      .notNull()
      .default(sql`'{}'`),
    channels: json<Channel[]>("channels")
      .notNull()
      .default(sql`'["email"]'`),
    status: text("status", { enum: ["active", "expired", "cancelled", "fulfilled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at").notNull().default(nowMs),
    expiresAt: timestamp("expires_at").notNull(),
    lastNotifiedAt: timestamp("last_notified_at"),
    /** For the "average time until a seat opens" metric. */
    firstNotifiedAt: timestamp("first_notified_at"),
    notifyCount: integer("notify_count").notNull().default(0),
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    index("alerts_watched_subject_status_idx").on(table.watchedSubjectId, table.status),
    index("alerts_user_id_idx").on(table.userId),
  ],
);

/** Seats that opened and offers that were published. No personal data: feeds the metrics. */
export const seatEvents = sqliteTable(
  "seat_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    watchedSubjectId: text("watched_subject_id")
      .notNull()
      .references(() => watchedSubjects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["opened", "published"] }).notNull(),
    nrc: text("nrc"),
    availableBefore: integer("available_before"),
    availableAfter: integer("available_after"),
    occurredAt: timestamp("occurred_at").notNull().default(nowMs),
  },
  (table) => [index("seat_events_occurred_at_idx").on(table.occurredAt)],
);

/**
 * Outbox: detecting a change and delivering the message are separate steps. The poll writes
 * rows here; the dispatcher sends them, retries failures and respects the email quota.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").$type<Channel>().notNull(),
    payload: json<NotificationPayload>("payload").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed", "skipped"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at").notNull().default(nowMs),
    createdAt: timestamp("created_at").notNull().default(nowMs),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("notifications_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
    index("notifications_created_at_idx").on(table.createdAt),
    index("notifications_alert_id_idx").on(table.alertId),
    index("notifications_user_id_idx").on(table.userId),
  ],
);

/** Registration periods. Alerts expire when the period of their cycle ends. */
export const registrationWindows = sqliteTable("registration_windows", {
  cycle: text("cycle").primaryKey(),
  label: text("label").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
});
