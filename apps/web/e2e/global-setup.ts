import { rm } from "node:fs/promises";

import { createDb } from "@haycupo/db";
import { runMigrations } from "@haycupo/db/migrate";
import { sql } from "drizzle-orm";

import { E2E } from "./env";

/** A clean database and no emails from a previous run. */
export default async function globalSetup(): Promise<void> {
  await runMigrations(E2E.databaseUrl);
  const { db, close } = createDb(E2E.databaseUrl, { max: 1 });
  try {
    await db.execute(sql`
      TRUNCATE users, sessions, login_tokens, telegram_link_tokens, push_subscriptions, alerts,
        notifications, seat_events, section_states, watched_subjects, offer_snapshots, subjects,
        siiau_options, siiau_requests, metrics_daily
      RESTART IDENTITY CASCADE`);
    await db.execute(sql`
      UPDATE siiau_gateway SET lease_owner = NULL, lease_expires_at = NULL,
        last_request_finished_at = NULL, consecutive_failures = 0, trips = 0,
        paused_until = NULL, pause_reason = NULL, robots_fetched_at = NULL`);
  } finally {
    await close();
  }
  await rm(E2E.emailDir, { recursive: true, force: true });
}
