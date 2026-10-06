import {
  alerts,
  loginTokens,
  notifications,
  offerSnapshots,
  sessions,
  siiauRequests,
  telegramLinkTokens,
  users,
  watchedSubjects,
} from "@haycupo/db";
import { describe, expect, it } from "vitest";

import { isPurgeMinute, purgeOldData } from "../src/retention";
import { useHarness } from "./harness";

const DAY = 24 * 60 * 60_000;
const now = new Date("2027-02-01T12:17:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

describe("purgeOldData", () => {
  const h = useHarness();

  it("deletes only what is past its retention period", async () => {
    const [user] = await h.db.insert(users).values({ email: "ana@example.com" }).returning();
    const [subject] = await h.db
      .insert(watchedSubjects)
      .values({ cycle: "202710", center: "D", subjectCode: "I5890" })
      .returning();
    if (!user || !subject) throw new Error("setup failed");

    const alert = (values: Partial<typeof alerts.$inferInsert>) => ({
      userId: user.id,
      watchedSubjectId: subject.id,
      kind: "section" as const,
      nrc: "78088",
      expiresAt: daysAgo(200),
      ...values,
    });
    const [active, recentlyEnded] = await h.db
      .insert(alerts)
      .values([
        alert({ status: "active", expiresAt: daysAgo(-10) }),
        alert({ status: "expired", endedAt: daysAgo(10) }),
        alert({ status: "cancelled", endedAt: daysAgo(181) }),
      ])
      .returning();
    if (!active || !recentlyEnded) throw new Error("setup failed");

    const payload = {
      reason: "seat_opened" as const,
      subject: { cycle: "202710", center: "D", code: "I5890", name: null },
      alert: { id: active.id, kind: "section" as const, nrc: "78088", filters: {} },
      sections: [],
      detectedAt: now.toISOString(),
    };
    await h.db.insert(notifications).values([
      { alertId: active.id, userId: user.id, channel: "email", payload, createdAt: daysAgo(31) },
      { alertId: active.id, userId: user.id, channel: "email", payload, createdAt: daysAgo(2) },
    ]);
    const request = {
      durationMs: 100,
      purpose: "poll" as const,
      path: "/x",
      outcome: "ok" as const,
    };
    await h.db.insert(siiauRequests).values([
      { ...request, startedAt: daysAgo(8) },
      { ...request, startedAt: daysAgo(1) },
    ]);
    const snapshot = { cycle: "202710", center: "D", queryKind: "code" as const };
    await h.db.insert(offerSnapshots).values([
      { ...snapshot, queryValue: "OLD", fetchedAt: daysAgo(31) },
      { ...snapshot, queryValue: "FAILED", lastErrorAt: daysAgo(40) },
      { ...snapshot, queryValue: "NEW", fetchedAt: daysAgo(1) },
    ]);
    await h.db.insert(loginTokens).values([
      { tokenHash: "old", email: "ana@example.com", expiresAt: daysAgo(2) },
      { tokenHash: "new", email: "ana@example.com", expiresAt: daysAgo(-1) },
    ]);
    await h.db.insert(sessions).values([
      { idHash: "expired", userId: user.id, expiresAt: daysAgo(1) },
      { idHash: "valid", userId: user.id, expiresAt: daysAgo(-29) },
    ]);
    await h.db.insert(telegramLinkTokens).values([
      { tokenHash: "expired", userId: user.id, expiresAt: daysAgo(1) },
      { tokenHash: "valid", userId: user.id, expiresAt: daysAgo(-0.01) },
    ]);

    const summary = await purgeOldData(h.db, now);

    expect(summary).toEqual({
      siiauRequests: 1,
      notifications: 1,
      alerts: 1,
      offerSnapshots: 2,
      loginTokens: 1,
      sessions: 1,
      telegramLinkTokens: 1,
    });
    const left = await h.db.select({ id: alerts.id }).from(alerts);
    expect(left.map((row) => row.id).sort()).toEqual([active.id, recentlyEnded.id].sort());
    const snapshots = await h.db.select({ value: offerSnapshots.queryValue }).from(offerSnapshots);
    expect(snapshots).toEqual([{ value: "NEW" }]);
    // The account itself stays until the student deletes it.
    expect(await h.db.select({ id: users.id }).from(users)).toHaveLength(1);
  });

  it("runs once an hour", () => {
    expect(isPurgeMinute(new Date("2027-02-01T12:17:30Z"))).toBe(true);
    expect(isPurgeMinute(new Date("2027-02-01T12:18:00Z"))).toBe(false);
  });
});
