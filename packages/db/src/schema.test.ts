import { eq, sql } from "drizzle-orm";
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

  it("rejects rows that point to nothing (libSQL enforces foreign keys on local files)", async () => {
    const [user] = await handle.db.insert(users).values({ email: "a@example.com" }).returning();
    if (!user) throw new Error("insert failed");

    await expect(
      handle.db.insert(alerts).values({
        userId: user.id,
        watchedSubjectId: "no-such-subject",
        kind: "section",
        nrc: "78088",
        expiresAt: new Date("2027-01-16T06:00:00Z"),
      }),
    ).rejects.toThrow();
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

  it("stores timestamps as milliseconds and reads them as dates", async () => {
    const at = new Date("2027-01-11T19:05:00.123Z");
    await handle.db.insert(users).values({ email: "c@example.com", telegramLinkedAt: at });

    const [raw] = await handle.db.all<{ linked: number }>(
      sql`SELECT telegram_linked_at AS linked FROM users`,
    );
    const [row] = await handle.db.select().from(users);
    expect(raw?.linked).toBe(at.getTime());
    expect(row?.telegramLinkedAt).toEqual(at);
    expect(row?.createdAt).toBeInstanceOf(Date);
  });
});
