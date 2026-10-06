import type { Section } from "@haycupo/siiau";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * One row (id = 1) that every process uses to take turns talking to SIIAU: a lease so only one
 * request is in flight, the end time of the last request for the pause between requests, and
 * the circuit breaker. Living in Postgres, it works the same on Cloudflare, on a VM and in tests.
 */
export const siiauGateway = pgTable(
  "siiau_gateway",
  {
    id: smallint("id").primaryKey().default(1),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamptz("lease_expires_at"),
    lastRequestFinishedAt: timestamptz("last_request_finished_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** How many times the breaker has tripped in a row; doubles the pause each time. */
    trips: integer("trips").notNull().default(0),
    pausedUntil: timestamptz("paused_until"),
    pauseReason: text("pause_reason"),
    robotsTxt: text("robots_txt"),
    robotsStatus: integer("robots_status"),
    robotsFetchedAt: timestamptz("robots_fetched_at"),
  },
  (table) => [check("siiau_gateway_singleton", sql`${table.id} = 1`)],
);

/** Every request made to SIIAU, for the status page. Pruned after a few days. */
export const siiauRequests = pgTable(
  "siiau_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    startedAt: timestamptz("started_at").notNull(),
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
export const siiauOptions = pgTable(
  "siiau_options",
  {
    kind: text("kind", { enum: ["cycle", "center"] }).notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.code] })],
);

/**
 * Last result of each query to SIIAU, shared by everyone who searches it: a hundred students
 * looking at I5890 cost one request every few minutes, not a hundred.
 */
export const offerSnapshots = pgTable(
  "offer_snapshots",
  {
    cycle: text("cycle").notNull(),
    center: text("center").notNull(),
    queryKind: text("query_kind", { enum: ["code", "name"] }).notNull(),
    queryValue: text("query_value").notNull(),
    fetchedAt: timestamptz("fetched_at"),
    totalRecords: integer("total_records"),
    sections: jsonb("sections").$type<Section[]>(),
    lastError: text("last_error"),
    lastErrorAt: timestamptz("last_error_at"),
  },
  (table) => [
    primaryKey({ columns: [table.cycle, table.center, table.queryKind, table.queryValue] }),
  ],
);

/** Subjects seen in any result, for autocomplete. Grows as people search. */
export const subjects = pgTable(
  "subjects",
  {
    center: text("center").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    lastSeenCycle: text("last_seen_cycle").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.center, table.code] })],
);
