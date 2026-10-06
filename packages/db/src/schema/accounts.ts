import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { boolean, nowMs, timestamp, uuidPrimaryKey } from "./columns";

/**
 * A student. Only what the service needs: an email address to sign in and to send alerts.
 * No name, no student ID, no SIIAU password, no IP addresses.
 */
export const users = sqliteTable("users", {
  id: uuidPrimaryKey(),
  /** Lowercased. */
  email: text("email").notNull().unique(),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  /** Private chat with the bot, once the student links it. Telegram chat ids fit in 52 bits. */
  telegramChatId: integer("telegram_chat_id").unique(),
  telegramLinkedAt: timestamp("telegram_linked_at"),
  createdAt: timestamp("created_at").notNull().default(nowMs),
});

/** Signed-in browsers. The cookie holds a random id; we store only its SHA-256. */
export const sessions = sqliteTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(nowMs),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/** Magic links. Single use, 15 minutes; only the SHA-256 of the token is stored. */
export const loginTokens = sqliteTable(
  "login_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    /** Where to go after signing in (a path inside the site). */
    next: text("next"),
    createdAt: timestamp("created_at").notNull().default(nowMs),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
  },
  (table) => [index("login_tokens_email_idx").on(table.email, table.createdAt)],
);

/** One-use codes for t.me/<bot>?start=<code>, 15 minutes; only the SHA-256 is stored. */
export const telegramLinkTokens = sqliteTable(
  "telegram_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(nowMs),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("telegram_link_tokens_user_id_idx").on(table.userId)],
);

/** Browsers that accepted notifications (Web Push). One student may have several devices. */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: uuidPrimaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().default(nowMs),
    lastSuccessAt: timestamp("last_success_at"),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)],
);
