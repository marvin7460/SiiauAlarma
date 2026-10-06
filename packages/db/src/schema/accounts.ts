import { bigint, boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

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
  /** Private chat with the bot, once the student links it. Telegram chat ids fit in 52 bits. */
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }).unique(),
  telegramLinkedAt: timestamptz("telegram_linked_at"),
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

/** One-use codes for t.me/<bot>?start=<code>, 15 minutes; only the SHA-256 is stored. */
export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  expiresAt: timestamptz("expires_at").notNull(),
});

/** Browsers that accepted notifications (Web Push). One student may have several devices. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    lastSuccessAt: timestamptz("last_success_at"),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)],
);
