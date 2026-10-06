import type { AlertFilters, AlertKind, Channel, NotificationPayload } from "@haycupo/core";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./accounts";
import { timestamptz } from "./columns";

/**
 * A (cycle, campus, subject) that at least one alert watches. The poller works per subject,
 * not per student: one request to SIIAU serves every alert on the subject.
 */
export const watchedSubjects = pgTable(
  "watched_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycle: text("cycle").notNull(),
    center: text("center").notNull(),
    subjectCode: text("subject_code").notNull(),
    subjectName: text("subject_name"),
    /** Whether SIIAU has any section for it; null until the first successful poll. */
    published: boolean("published"),
    nextPollAt: timestamptz("next_poll_at").notNull().defaultNow(),
    lastPolledAt: timestamptz("last_polled_at"),
    /** Set once the first poll succeeded: from then on, changes are news. */
    lastSuccessAt: timestamptz("last_success_at"),
    lastError: text("last_error"),
    lastErrorAt: timestamptz("last_error_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("watched_subjects_key").on(table.cycle, table.center, table.subjectCode),
    index("watched_subjects_next_poll_at_idx").on(table.nextPollAt),
  ],
);

/** Free seats per section at the last successful poll; what the next poll compares against. */
export const sectionStates = pgTable(
  "section_states",
  {
    watchedSubjectId: uuid("watched_subject_id")
      .notNull()
      .references(() => watchedSubjects.id, { onDelete: "cascade" }),
    nrc: text("nrc").notNull(),
    available: integer("available").notNull(),
    capacity: integer("capacity").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.watchedSubjectId, table.nrc] })],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    watchedSubjectId: uuid("watched_subject_id")
      .notNull()
      .references(() => watchedSubjects.id, { onDelete: "restrict" }),
    kind: text("kind").$type<AlertKind>().notNull(),
    /** Only for kind = "section". */
    nrc: text("nrc"),
    filters: jsonb("filters").$type<AlertFilters>().notNull().default({}),
    channels: text("channels")
      .array()
      .$type<Channel[]>()
      .notNull()
      .default(sql`'{email}'::text[]`),
    status: text("status", { enum: ["active", "expired", "cancelled", "fulfilled"] })
      .notNull()
      .default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
    lastNotifiedAt: timestamptz("last_notified_at"),
    /** For the "average time until a seat opens" metric. */
    firstNotifiedAt: timestamptz("first_notified_at"),
    notifyCount: integer("notify_count").notNull().default(0),
    endedAt: timestamptz("ended_at"),
  },
  (table) => [
    index("alerts_watched_subject_status_idx").on(table.watchedSubjectId, table.status),
    index("alerts_user_id_idx").on(table.userId),
  ],
);

/** Seats that opened and offers that were published. No personal data: feeds the metrics. */
export const seatEvents = pgTable(
  "seat_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    watchedSubjectId: uuid("watched_subject_id")
      .notNull()
      .references(() => watchedSubjects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["opened", "published"] }).notNull(),
    nrc: text("nrc"),
    availableBefore: integer("available_before"),
    availableAfter: integer("available_after"),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
  },
  (table) => [index("seat_events_occurred_at_idx").on(table.occurredAt)],
);

/**
 * Outbox: detecting a change and delivering the message are separate steps. The poll writes
 * rows here; the dispatcher sends them, retries failures and respects the email quota.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").$type<Channel>().notNull(),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    status: text("status", { enum: ["pending", "sent", "failed", "skipped"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamptz("next_attempt_at").notNull().defaultNow(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    sentAt: timestamptz("sent_at"),
  },
  (table) => [index("notifications_status_next_attempt_idx").on(table.status, table.nextAttemptAt)],
);

/** Registration periods. Alerts expire when the period of their cycle ends. */
export const registrationWindows = pgTable("registration_windows", {
  cycle: text("cycle").primaryKey(),
  label: text("label").notNull(),
  startsAt: timestamptz("starts_at").notNull(),
  endsAt: timestamptz("ends_at").notNull(),
});
