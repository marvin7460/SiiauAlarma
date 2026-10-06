import { DEFAULT_SCHEDULE } from "@haycupo/core";
import {
  alerts,
  metricsDaily,
  notifications,
  pollerState,
  registrationWindows,
  seatEvents,
  users,
  watchedSubjects,
  type Database,
} from "@haycupo/db";
import { createMemoryTransport, verifyAlertCancel } from "@haycupo/notify";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchNotifications } from "../src/dispatch";
import { runPollCycle, type PollDeps } from "../src/poll";
import { useHarness } from "./harness";

const MINUTE = 60_000;
const SECRET = "s".repeat(40);

/**
 * A full poll cycle against the fake SIIAU and a real Postgres (PGlite): the gateway, the
 * parser, change detection, the outbox and the email template, end to end.
 */
describe("poll cycle", () => {
  const h = useHarness();
  let clock: Date;
  let email: ReturnType<typeof createMemoryTransport>;

  const pollDeps = (): PollDeps => ({
    db: h.db,
    gateway: h.gateway,
    schedule: DEFAULT_SCHEDULE,
    cooldownMs: 30 * MINUTE,
    now: () => clock,
  });

  /** One cron run: poll what is due, then send. Moves the clock past every next_poll_at. */
  async function cronRun() {
    const summary = await runPollCycle(pollDeps(), { maxSubjects: 10, budgetMs: 30_000 });
    const dispatched = await dispatchNotifications(
      {
        db: h.db,
        email,
        appUrl: "https://haycupo.example",
        appSecret: SECRET,
        emailDailyLimit: 90,
        now: () => clock,
      },
      { limit: 30 },
    );
    clock = new Date(clock.getTime() + 61 * MINUTE);
    return { summary, dispatched };
  }

  async function createAlert(
    db: Database,
    input: {
      kind?: "section" | "subject" | "offer";
      nrc?: string | null;
      cycle?: string;
      email?: string;
    } = {},
  ) {
    const [user] = await db
      .insert(users)
      .values({ email: input.email ?? "ana@example.com" })
      .onConflictDoUpdate({ target: users.email, set: { emailNotifications: true } })
      .returning();
    const [subject] = await db
      .insert(watchedSubjects)
      .values({
        cycle: input.cycle ?? "202620",
        center: "D",
        subjectCode: "I5890",
        nextPollAt: clock,
      })
      .onConflictDoUpdate({
        target: [watchedSubjects.cycle, watchedSubjects.center, watchedSubjects.subjectCode],
        set: { nextPollAt: clock },
      })
      .returning();
    if (!user || !subject) throw new Error("setup failed");
    const [alert] = await db
      .insert(alerts)
      .values({
        userId: user.id,
        watchedSubjectId: subject.id,
        kind: input.kind ?? "section",
        nrc: input.nrc === undefined ? "78088" : input.nrc,
        expiresAt: new Date(clock.getTime() + 30 * 24 * 60 * MINUTE),
        createdAt: clock,
      })
      .returning();
    if (!alert) throw new Error("setup failed");
    return { user, subject, alert };
  }

  beforeEach(() => {
    clock = new Date("2026-10-06T18:00:00Z");
    email = createMemoryTransport();
  });

  it("sends exactly one email when a seat goes from 0 to 1", async () => {
    const { alert } = await createAlert(h.db);

    await cronRun(); // baseline: NRC 78088 has 0 seats
    expect(email.sent).toHaveLength(0);

    h.fake.setAvailable("202620", "D", "78088", 1);
    const { dispatched } = await cronRun();

    expect(dispatched.sent).toBe(1);
    expect(email.sent).toHaveLength(1);
    const [message] = email.sent;
    expect(message?.to).toBe("ana@example.com");
    expect(message?.subject).toBe("¡Hay cupo! I5890 BASES DE DATOS · NRC 78088");
    expect(message?.headers?.["List-Unsubscribe"]).toMatch(/\/api\/alertas\/cancelar\?alerta=/);
    const firma = /firma=([\w-]+)/.exec(message?.text ?? "")?.[1] ?? "";
    expect(await verifyAlertCancel(SECRET, alert.id, firma)).toBe(true);

    // Seats stay open: not news, no second email.
    await cronRun();
    expect(email.sent).toHaveLength(1);
  });

  it("uses one request per subject for every alert on it", async () => {
    await createAlert(h.db, { email: "ana@example.com" });
    await createAlert(h.db, { email: "luis@example.com", kind: "subject", nrc: null });
    await cronRun();
    h.fake.setAvailable("202620", "D", "78088", 2);

    await cronRun();

    const pages = h.fake.requests.filter((request) => request.path.includes("consulta_oferta"));
    expect(pages).toHaveLength(2); // two cron runs, one request each
    expect(email.sent.map((message) => message.to).sort()).toEqual([
      "ana@example.com",
      "luis@example.com",
    ]);
  });

  it("does not spam when a seat flaps within the cooldown", async () => {
    await createAlert(h.db);
    await cronRun();

    h.fake.setAvailable("202620", "D", "78088", 1);
    await runPollCycle(pollDeps(), { maxSubjects: 10, budgetMs: 30_000 });
    // 5 minutes later the seat is gone, and 5 minutes after that it is back.
    for (const seats of [0, 1]) {
      clock = new Date(clock.getTime() + 5 * MINUTE);
      await h.db.update(watchedSubjects).set({ nextPollAt: clock });
      h.fake.setAvailable("202620", "D", "78088", seats);
      await runPollCycle(pollDeps(), { maxSubjects: 10, budgetMs: 30_000 });
    }

    const rows = await h.db.select().from(notifications);
    expect(rows).toHaveLength(1);
  });

  it("notifies nobody when SIIAU fails, and backs off", async () => {
    await createAlert(h.db);
    await cronRun();
    h.fake.setAvailable("202620", "D", "78088", 1);
    h.fake.failNext(503);

    const { summary } = await cronRun();

    expect(summary.outcomes).toEqual([
      expect.objectContaining({ status: "failed", problem: "siiau_unavailable" }),
    ]);
    expect(email.sent).toHaveLength(0);
    const [subject] = await h.db.select().from(watchedSubjects);
    expect(subject?.consecutiveFailures).toBe(1);
    expect(subject?.lastError).toMatch(/siiau_unavailable/);
  });

  it("notifies nobody when SIIAU's page changes", async () => {
    await createAlert(h.db);
    await cronRun();
    const real = h.fake.handle.bind(h.fake);
    h.fake.handle = async (request) =>
      new URL(request.url).pathname.includes("consulta_oferta")
        ? new Response("<html><body>Página nueva</body></html>")
        : real(request);

    const { summary } = await cronRun();

    expect(summary.outcomes[0]).toMatchObject({ status: "failed", problem: "siiau_changed" });
    expect(email.sent).toHaveLength(0);
  });

  it("treats all sections vanishing as a SIIAU problem, not as news", async () => {
    await createAlert(h.db);
    await cronRun();
    const sections = h.fake.offers.get("202620|D") ?? [];
    h.fake.offers.set("202620|D", []);

    const { summary } = await cronRun();
    expect(summary.outcomes[0]).toMatchObject({ status: "failed", problem: "empty_result" });

    // When they come back with a seat, that is news again.
    h.fake.offers.set("202620|D", sections);
    h.fake.setAvailable("202620", "D", "78088", 1);
    await cronRun();
    expect(email.sent).toHaveLength(1);
  });

  it("tells offer alerts when the offer is published, once", async () => {
    const { alert } = await createAlert(h.db, { kind: "offer", nrc: null, cycle: "202710" });
    await cronRun(); // 202710 has no sections yet

    h.fake.offers.set("202710|D", h.fake.offers.get("202620|D") ?? []);
    await cronRun();
    await cronRun();

    expect(email.sent.map((message) => message.subject)).toEqual([
      "Ya publicaron I5890 BASES DE DATOS para 2027A",
    ]);
    const [stored] = await h.db.select().from(alerts).where(eq(alerts.id, alert.id));
    expect(stored?.status).toBe("fulfilled");
    expect(await h.db.select({ kind: seatEvents.kind }).from(seatEvents)).toContainEqual({
      kind: "published",
    });
  });

  it("polls unpublished offers hourly and others every 5 minutes", async () => {
    await createAlert(h.db, { kind: "offer", nrc: null, cycle: "202710" });
    await createAlert(h.db, { kind: "section", cycle: "202620" });
    const start = clock;

    await runPollCycle(pollDeps(), { maxSubjects: 10, budgetMs: 30_000 });

    const subjects = await h.db.select().from(watchedSubjects);
    const delay = (cycle: string) =>
      ((subjects.find((s) => s.cycle === cycle)?.nextPollAt.getTime() ?? 0) - start.getTime()) /
      MINUTE;
    expect(delay("202710")).toBe(60);
    expect(delay("202620")).toBe(5);
  });

  it("polls every 2 minutes during the cycle's registration week", async () => {
    clock = new Date("2027-01-12T18:00:00Z");
    await h.db.insert(registrationWindows).values({
      cycle: "202620",
      label: "test",
      startsAt: new Date("2027-01-11T06:00:00Z"),
      endsAt: new Date("2027-01-16T06:00:00Z"),
    });
    await createAlert(h.db);

    await runPollCycle(pollDeps(), { maxSubjects: 10, budgetMs: 30_000 });

    const [subject] = await h.db.select().from(watchedSubjects);
    expect((subject?.nextPollAt.getTime() ?? 0) - clock.getTime()).toBe(2 * MINUTE);
  });

  it("expires alerts and stops polling subjects nobody waits for", async () => {
    const { alert } = await createAlert(h.db);
    await h.db.update(alerts).set({ expiresAt: clock }).where(eq(alerts.id, alert.id));

    const { summary } = await cronRun();

    expect(summary.expired).toBe(1);
    expect(summary.outcomes).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
  });

  it("respects the daily email quota", async () => {
    await createAlert(h.db);
    await cronRun();
    await h.db
      .insert(metricsDaily)
      .values({ day: clock.toISOString().slice(0, 10), emailsSent: 90 });
    h.fake.setAvailable("202620", "D", "78088", 1);

    const { dispatched } = await cronRun();

    expect(dispatched).toMatchObject({ sent: 0, skipped: 1 });
    const [row] = await h.db.select().from(notifications);
    expect(row?.lastError).toBe("daily email quota reached");
  });

  it("records the run for the status page", async () => {
    await createAlert(h.db);

    await cronRun();

    const [state] = await h.db.select().from(pollerState);
    expect(state).toMatchObject({ lastRunSubjects: 1, lastRunError: null });
    expect(state?.lastRunFinishedAt).toBeInstanceOf(Date);
  });
});
