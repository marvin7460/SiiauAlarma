import { alerts, metricsDaily, users, watchedSubjects } from "@haycupo/db";
import { createTestDb, resetTestDb } from "@haycupo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { averageMinutesToSeat, getImpact } from "./impact";

const MINUTE = 60_000;
let handle: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await resetTestDb(handle.db);
});

async function seedAlerts(
  rows: { kind: "section" | "subject" | "offer"; waitedMinutes: number | null; active?: boolean }[],
) {
  const db = handle.db;
  const [user] = await db.insert(users).values({ email: "ana@example.com" }).returning();
  const [subject] = await db
    .insert(watchedSubjects)
    .values({ cycle: "202710", center: "D", subjectCode: "I5890" })
    .returning();
  if (!user || !subject) throw new Error("setup failed");
  const createdAt = new Date("2027-01-11T15:00:00Z");
  await db.insert(alerts).values(
    rows.map((row) => ({
      userId: user.id,
      watchedSubjectId: subject.id,
      kind: row.kind,
      nrc: row.kind === "section" ? "78088" : null,
      status: row.active === false ? ("fulfilled" as const) : ("active" as const),
      createdAt,
      expiresAt: new Date("2027-01-16T06:00:00Z"),
      firstNotifiedAt:
        row.waitedMinutes === null
          ? null
          : new Date(createdAt.getTime() + row.waitedMinutes * MINUTE),
    })),
  );
}

describe("getImpact", () => {
  it("adds up the daily counters and fills days without activity", async () => {
    await seedAlerts([{ kind: "section", waitedMinutes: null }]);
    await handle.db.insert(metricsDaily).values([
      { day: "2027-01-10", searches: 40, alertsCreated: 5, seatsOpened: 1, emailsSent: 3 },
      {
        day: "2027-01-12",
        searches: 60,
        alertsCreated: 7,
        seatsOpened: 4,
        telegramSent: 2,
        pushSent: 1,
      },
    ]);

    const impact = await getImpact(handle.db, new Date("2027-01-12T20:00:00Z"), 3);

    expect(impact.totals).toEqual({
      searches: 100,
      alertsCreated: 12,
      seatsOpened: 5,
      notifications: 6,
    });
    expect(impact.now).toEqual({ activeAlerts: 1, watchedSubjects: 1, accounts: 1 });
    expect(impact.lastDays).toEqual([
      { day: "2027-01-10", seatsOpened: 1, notifications: 3 },
      { day: "2027-01-11", seatsOpened: 0, notifications: 0 },
      { day: "2027-01-12", seatsOpened: 4, notifications: 3 },
    ]);
  });

  it("works on an empty database", async () => {
    const impact = await getImpact(handle.db, new Date("2027-01-12T20:00:00Z"), 1);

    expect(impact.totals.searches).toBe(0);
    expect(impact.averageMinutesToSeat).toBeNull();
  });
});

// TODO(Marvin): remove `.skip` when you write averageMinutesToSeat (see impact.ts).
describe.skip("averageMinutesToSeat", () => {
  it("averages the wait of alerts that found a seat", async () => {
    await seedAlerts([
      { kind: "section", waitedMinutes: 30 },
      { kind: "subject", waitedMinutes: 90, active: false },
      { kind: "section", waitedMinutes: null }, // still waiting: does not count
      { kind: "offer", waitedMinutes: 600 }, // waits for a publication, not a seat
    ]);

    expect(await averageMinutesToSeat(handle.db)).toBe(60);
  });

  it("is null when no alert has found a seat", async () => {
    await seedAlerts([{ kind: "section", waitedMinutes: null }]);

    expect(await averageMinutesToSeat(handle.db)).toBeNull();
  });
});
