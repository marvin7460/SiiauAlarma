import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { timestamp } from "./columns";

/**
 * Counters that slow down abuse, one row per key and fixed time window. Keys never hold
 * personal data in clear: an IP address or an email is an HMAC (packages/engine/src/limits.ts),
 * a person is their user id. Rows older than a day are purged.
 */
export const rateLimits = sqliteTable("rate_limits", {
  /** "login-ip:Xy3…", "search:global", "alert:<user id>"… */
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start").notNull(),
  hits: integer("hits").notNull(),
});
