import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";

/**
 * A student. Only what the service needs: an email address to sign in and to send alerts.
 * No name, no student ID, no SIIAU password, no IP addresses.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Lowercased. */
  email: text("email").notNull().unique(),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

/** Signed-in browsers. The cookie holds a random id; we store only its SHA-256. */
export const sessions = pgTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/** Magic links. Single use, 15 minutes; only the SHA-256 of the token is stored. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    /** Where to go after signing in (a path inside the site). */
    next: text("next"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
    usedAt: timestamptz("used_at"),
  },
  (table) => [index("login_tokens_email_idx").on(table.email, table.createdAt)],
);
