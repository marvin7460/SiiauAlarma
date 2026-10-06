import type { Section } from "@haycupo/siiau";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { json, nowMs, timestamp } from "./columns";

/**
 * One row (id = 1) that every process uses to take turns talking to SIIAU: a lease so only one
 * request is in flight, the end time of the last request for the pause between requests, and
 * the circuit breaker. Living in the database, it works the same in production and in tests.
 */
export const siiauGateway = sqliteTable(
  "siiau_gateway",
  {
    id: integer("id").primaryKey().default(1),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    lastRequestFinishedAt: timestamp("last_request_finished_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** How many times the breaker has tripped in a row; doubles the pause each time. */
    trips: integer("trips").notNull().default(0),
    pausedUntil: timestamp("paused_until"),
    pauseReason: text("pause_reason"),
    robotsTxt: text("robots_txt"),
    robotsStatus: integer("robots_status"),
    robotsFetchedAt: timestamp("robots_fetched_at"),
  },
  (table) => [check("siiau_gateway_singleton", sql`${table.id} = 1`)],
);

/** Every request made to SIIAU, for the status page. Pruned after a few days. */
export const siiauRequests = sqliteTable(
  "siiau_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: timestamp("started_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    purpose: text("purpose", { enum: ["search", "poll", "options", "robots"] }).notNull(),
    path: text("path").notNull(),
    status: integer("status"),
    outcome: text("outcome", {
      enum: ["ok", "http_error", "network_error", "parse_error"],
    }).notNull(),
  },
  (table) => [index("siiau_requests_started_at_idx").on(table.startedAt)],
);

/** Cycles and campuses read from SIIAU's search form. */
export const siiauOptions = sqliteTable(
  "siiau_options",
  {
    kind: text("kind", { enum: ["cycle", "center"] }).notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    updatedAt: timestamp("updated_at").notNull().default(nowMs),
  },
  (table) => [primaryKey({ columns: [table.kind, table.code] })],
);

/**
 * Last result of each query to SIIAU, shared by everyone who searches it: a hundred students
 * looking at I5890 cost one request every few minutes, not a hundred.
 */
export const offerSnapshots = sqliteTable(
  "offer_snapshots",
  {
    cycle: text("cycle").notNull(),
    center: text("center").notNull(),
    queryKind: text("query_kind", { enum: ["code", "name"] }).notNull(),
    queryValue: text("query_value").notNull(),
    fetchedAt: timestamp("fetched_at"),
    totalRecords: integer("total_records"),
    sections: json<Section[]>("sections"),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at"),
  },
  (table) => [
    primaryKey({ columns: [table.cycle, table.center, table.queryKind, table.queryValue] }),
  ],
);

/** Subjects seen in any result, for autocomplete. Grows as people search. */
export const subjects = sqliteTable(
  "subjects",
  {
    center: text("center").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    lastSeenCycle: text("last_seen_cycle").notNull(),
    updatedAt: timestamp("updated_at").notNull().default(nowMs),
  },
  (table) => [primaryKey({ columns: [table.center, table.code] })],
);

/** What the last poller run did, for the status page. One row (id = 1). */
export const pollerState = sqliteTable(
  "poller_state",
  {
    id: integer("id").primaryKey().default(1),
    lastRunStartedAt: timestamp("last_run_started_at"),
    lastRunFinishedAt: timestamp("last_run_finished_at"),
    lastRunSubjects: integer("last_run_subjects").notNull().default(0),
    lastRunNotifications: integer("last_run_notifications").notNull().default(0),
    lastRunError: text("last_run_error"),
  },
  (table) => [check("poller_state_singleton", sql`${table.id} = 1`)],
);
