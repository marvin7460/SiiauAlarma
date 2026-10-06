import { rm } from "node:fs/promises";

import { createDb } from "@haycupo/db";
import { MIGRATIONS_FOLDER, runMigrations } from "@haycupo/db/migrate";
import { resetTestDb } from "@haycupo/db/testing";

import { DATABASE_URL, E2E } from "./env";

/** A migrated, empty database and no emails from a previous run. */
export default async function globalSetup(): Promise<void> {
  await runMigrations({ url: DATABASE_URL }, MIGRATIONS_FOLDER);
  const { db, close } = createDb({ url: DATABASE_URL });
  try {
    await resetTestDb(db);
  } finally {
    await close();
  }
  await rm(E2E.emailDir, { recursive: true, force: true });
}
