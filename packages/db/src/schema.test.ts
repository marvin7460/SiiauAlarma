import { count, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DbHandle } from "./client";
import {
  alerts,
  registrationWindows,
  siiauGateway,
  subjects,
  users,
  watchedSubjects,
} from "./schema";
import { createTestDb } from "./testing";

describe("migrations", () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("create the gateway's single row", async () => {
    const rows = await handle.db.select().from(siiauGateway);

    expect(rows).toEqual([expect.objectContaining({ id: 1, consecutiveFailures: 0, trips: 0 })]);
  });

  it("refuse a second gateway row", async () => {
    await expect(handle.db.insert(siiauGateway).values({ id: 2 })).rejects.toThrow();
  });

  it("create working tables", async () => {
    await handle.db
      .insert(subjects)
      .values({ center: "D", code: "I5890", name: "BASES DE DATOS", lastSeenCycle: "202620" });

    const [row] = await handle.db.select().from(subjects).where(eq(subjects.code, "I5890"));
    expect(row?.name).toBe("BASES DE DATOS");
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });
});

describe("alerts migration", () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("seeds the 2027A registration window in Guadalajara time", async () => {
    const [window] = await handle.db.select().from(registrationWindows);

    expect(window?.startsAt.toISOString()).toBe("2027-01-11T06:00:00.000Z");
    expect(window?.endsAt.toISOString()).toBe("2027-01-16T06:00:00.000Z");
  });

  it("deletes a user's alerts and sessions with the user", async () => {
    const [user] = await handle.db.insert(users).values({ email: "a@example.com" }).returning();
    const [subject] = await handle.db
      .insert(watchedSubjects)
      .values({ cycle: "202620", center: "D", subjectCode: "I5890" })
      .returning();
    if (!user || !subject) throw new Error("insert failed");
    await handle.db.insert(alerts).values({
      userId: user.id,
      watchedSubjectId: subject.id,
      kind: "section",
      nrc: "78088",
      expiresAt: new Date("2027-01-16T06:00:00Z"),
    });

    await handle.db.delete(users).where(eq(users.id, user.id));

    expect(await handle.db.select().from(alerts)).toEqual([]);
    expect(await handle.db.select().from(watchedSubjects)).toHaveLength(1);
  });

  it("defaults new alerts to email and active", async () => {
    const [user] = await handle.db.insert(users).values({ email: "b@example.com" }).returning();
    const [subject] = await handle.db
      .insert(watchedSubjects)
      .values({ cycle: "202620", center: "D", subjectCode: "I5890" })
      .returning();
    if (!user || !subject) throw new Error("insert failed");

    const [alert] = await handle.db
      .insert(alerts)
      .values({
        userId: user.id,
        watchedSubjectId: subject.id,
        kind: "subject",
        expiresAt: new Date(),
      })
      .returning();

    expect(alert).toMatchObject({ channels: ["email"], status: "active", filters: {} });
  });

  it("turn on row-level security on every table, so Supabase's Data API reads nothing", async () => {
    const { db } = handle;
    const tables = await db
      .select({ name: sql<string>`relname`, rls: sql<boolean>`relrowsecurity` })
      .from(sql`pg_class`)
      .where(sql`relnamespace = 'public'::regnamespace AND relkind = 'r'`);
    expect(tables.length).toBeGreaterThan(10);
    expect(tables.filter((table) => !table.rls)).toEqual([]);

    // Like Supabase's "anon" role: it has SELECT grants, but no policy lets a row through.
    await db.insert(users).values({ email: "ana@example.com" });
    await db.execute(sql`CREATE ROLE anon NOLOGIN`);
    await db.execute(sql`GRANT USAGE ON SCHEMA public TO anon`);
    await db.execute(sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`);
    await db.execute(sql`SET ROLE anon`);
    const asAnon = await db.select({ total: count() }).from(users);
    await db.execute(sql`RESET ROLE`);

    expect(asAnon).toEqual([{ total: 0 }]);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
