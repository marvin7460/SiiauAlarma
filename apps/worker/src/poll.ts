import {
  detectChanges,
  nextPollDelayMs,
  planNotifications,
  type NotificationPayload,
  type PollSchedule,
  type RegistrationWindow,
} from "@haycupo/core";
import {
  alerts,
  bumpMetric,
  notifications,
  pollerState,
  registrationWindows,
  seatEvents,
  sectionStates,
  watchedSubjects,
  type Database,
} from "@haycupo/db";
import { buildOfferUrl, type OfferPage } from "@haycupo/siiau";
import { and, asc, eq, exists, inArray, lte, notInArray, sql } from "drizzle-orm";

import { toProblem } from "./errors";
import type { SiiauGateway } from "./gateway";
import { fetchAndStoreOffer } from "./search";

export interface PollDeps {
  db: Database;
  gateway: SiiauGateway;
  schedule: PollSchedule;
  cooldownMs: number;
  now?: () => Date;
}

type WatchedSubject = typeof watchedSubjects.$inferSelect;

export type PollOutcome =
  | { status: "polled"; subjectId: string; notifications: number; opened: number }
  | { status: "failed"; subjectId: string; problem: string }
  | { status: "deferred"; subjectId: string; problem: string };

const CLAIM_MS = 5 * 60_000;

const now = (deps: Pick<PollDeps, "now">) => deps.now?.() ?? new Date();

export async function loadRegistrationWindows(db: Database): Promise<RegistrationWindow[]> {
  return db
    .select({
      cycle: registrationWindows.cycle,
      startsAt: registrationWindows.startsAt,
      endsAt: registrationWindows.endsAt,
    })
    .from(registrationWindows);
}

/** Alerts past their expiry stop; subjects nobody waits for stop being polled. */
export async function expireAlerts(db: Database, at: Date): Promise<number> {
  const expired = await db
    .update(alerts)
    .set({ status: "expired", endedAt: at })
    .where(and(eq(alerts.status, "active"), lte(alerts.expiresAt, at)))
    .returning({ id: alerts.id });
  return expired.length;
}

/**
 * Takes the most overdue subject that someone is waiting for, and pushes its next poll a few
 * minutes ahead so no other process takes it too. `FOR UPDATE SKIP LOCKED` makes this safe
 * with overlapping cron runs and parallel Worker invocations.
 */
export async function claimDueSubject(db: Database, at: Date): Promise<WatchedSubject | undefined> {
  const due = db
    .select({ id: watchedSubjects.id })
    .from(watchedSubjects)
    .where(
      and(
        lte(watchedSubjects.nextPollAt, at),
        exists(
          db
            .select({ one: sql`1` })
            .from(alerts)
            .where(
              and(eq(alerts.watchedSubjectId, watchedSubjects.id), eq(alerts.status, "active")),
            ),
        ),
      ),
    )
    .orderBy(asc(watchedSubjects.nextPollAt))
    .limit(1)
    .for("update", { skipLocked: true });
  const [claimed] = await db
    .update(watchedSubjects)
    .set({ nextPollAt: new Date(at.getTime() + CLAIM_MS) })
    .where(inArray(watchedSubjects.id, due))
    .returning();
  return claimed;
}

async function recordFailure(
  deps: PollDeps,
  subject: WatchedSubject,
  windows: RegistrationWindow[],
  problem: string,
  at: Date,
): Promise<void> {
  const failures = subject.consecutiveFailures + 1;
  const delay = nextPollDelayMs({
    now: at,
    cycle: subject.cycle,
    published: subject.published ?? true,
    consecutiveFailures: failures,
    windows,
    schedule: deps.schedule,
  });
  await deps.db
    .update(watchedSubjects)
    .set({
      consecutiveFailures: failures,
      lastError: problem,
      lastErrorAt: at,
      lastPolledAt: at,
      nextPollAt: new Date(at.getTime() + delay),
    })
    .where(eq(watchedSubjects.id, subject.id));
}

/**
 * Polls one subject and turns what changed into notifications (in the outbox). If anything
 * goes wrong with SIIAU, nothing is notified: a failed or strange answer is never news.
 */
export async function pollSubject(
  deps: PollDeps,
  subject: WatchedSubject,
  windows: RegistrationWindow[],
): Promise<PollOutcome> {
  const url = buildOfferUrl({
    cycle: subject.cycle,
    center: subject.center,
    subjectCode: subject.subjectCode,
  });
  const key = {
    cycle: subject.cycle,
    center: subject.center,
    queryKind: "code" as const,
    queryValue: subject.subjectCode,
  };

  let page: OfferPage;
  try {
    ({ page } = await fetchAndStoreOffer(deps, url, key, "poll"));
  } catch (error) {
    const problem = toProblem(error);
    const at = now(deps);
    if (problem.kind === "busy" || problem.kind === "paused" || problem.kind === "blocked") {
      // Not this subject's fault: try again soon, without counting a failure.
      await deps.db
        .update(watchedSubjects)
        .set({ nextPollAt: new Date(at.getTime() + 60_000) })
        .where(eq(watchedSubjects.id, subject.id));
      return { status: "deferred", subjectId: subject.id, problem: problem.kind };
    }
    if (problem.kind === "internal") throw error;
    await recordFailure(deps, subject, windows, `${problem.kind}: ${problem.message}`, at);
    return { status: "failed", subjectId: subject.id, problem: problem.kind };
  }

  const at = now(deps);
  return deps.db.transaction(async (tx) => {
    const states = await tx
      .select()
      .from(sectionStates)
      .where(eq(sectionStates.watchedSubjectId, subject.id));

    // Sections vanishing all at once looks like a SIIAU problem, not like news: keep the old
    // state, notify nobody, and report it.
    if (page.sections.length === 0 && states.length > 0) {
      await recordFailure(
        { ...deps, db: tx },
        subject,
        windows,
        "empty_result: SIIAU returned no sections for a subject that had them",
        at,
      );
      return { status: "failed" as const, subjectId: subject.id, problem: "empty_result" };
    }

    const previous = subject.lastSuccessAt
      ? {
          available: new Map(states.map((state) => [state.nrc, state.available])),
          published: subject.published ?? false,
        }
      : null;
    const changes = detectChanges(previous, page.sections);

    if (page.sections.length > 0) {
      await tx
        .insert(sectionStates)
        .values(
          page.sections.map((section) => ({
            watchedSubjectId: subject.id,
            nrc: section.nrc,
            available: section.available,
            capacity: section.capacity,
            updatedAt: at,
          })),
        )
        .onConflictDoUpdate({
          target: [sectionStates.watchedSubjectId, sectionStates.nrc],
          set: {
            available: sql`excluded.available`,
            capacity: sql`excluded.capacity`,
            updatedAt: at,
          },
        });
      await tx.delete(sectionStates).where(
        and(
          eq(sectionStates.watchedSubjectId, subject.id),
          notInArray(
            sectionStates.nrc,
            page.sections.map((section) => section.nrc),
          ),
        ),
      );
    }

    const events = [
      ...changes.opened.map((section) => ({
        watchedSubjectId: subject.id,
        kind: "opened" as const,
        nrc: section.nrc,
        availableBefore: previous?.available.get(section.nrc) ?? null,
        availableAfter: section.available,
        occurredAt: at,
      })),
      ...(changes.published
        ? [{ watchedSubjectId: subject.id, kind: "published" as const, occurredAt: at }]
        : []),
    ];
    if (events.length > 0) await tx.insert(seatEvents).values(events);
    await bumpMetric(tx, "seatsOpened", at, changes.opened.length);

    const activeAlerts = await tx
      .select()
      .from(alerts)
      .where(and(eq(alerts.watchedSubjectId, subject.id), eq(alerts.status, "active")));
    const planned = planNotifications(activeAlerts, changes, page.sections, at, deps.cooldownMs);
    const subjectName = page.sections[0]?.subjectName ?? subject.subjectName;

    let created = 0;
    for (const plan of planned) {
      const alert = activeAlerts.find((candidate) => candidate.id === plan.alertId);
      if (!alert) continue;
      const payload: NotificationPayload = {
        reason: plan.reason,
        subject: {
          cycle: subject.cycle,
          center: subject.center,
          code: subject.subjectCode,
          name: subjectName,
        },
        alert: { id: alert.id, kind: alert.kind, nrc: alert.nrc, filters: alert.filters },
        sections: plan.sections,
        detectedAt: at.toISOString(),
      };
      const rows = alert.channels.map((channel) => ({
        alertId: alert.id,
        userId: alert.userId,
        channel,
        payload,
        nextAttemptAt: at,
        createdAt: at,
      }));
      if (rows.length > 0) await tx.insert(notifications).values(rows);
      created += rows.length;
      await tx
        .update(alerts)
        .set({
          lastNotifiedAt: at,
          firstNotifiedAt: alert.firstNotifiedAt ?? at,
          notifyCount: alert.notifyCount + 1,
          // An offer is published once: that alert is done.
          ...(plan.reason === "offer_published"
            ? { status: "fulfilled" as const, endedAt: at }
            : {}),
        })
        .where(eq(alerts.id, alert.id));
    }

    const published = page.sections.length > 0;
    await tx
      .update(watchedSubjects)
      .set({
        subjectName,
        published,
        lastPolledAt: at,
        lastSuccessAt: at,
        consecutiveFailures: 0,
        lastError: null,
        nextPollAt: new Date(
          at.getTime() +
            nextPollDelayMs({
              now: at,
              cycle: subject.cycle,
              published,
              consecutiveFailures: 0,
              windows,
              schedule: deps.schedule,
            }),
        ),
      })
      .where(eq(watchedSubjects.id, subject.id));

    return {
      status: "polled" as const,
      subjectId: subject.id,
      notifications: created,
      opened: changes.opened.length,
    };
  });
}

export interface RunSummary {
  expired: number;
  outcomes: PollOutcome[];
}

/**
 * One cron run: expire old alerts, then poll due subjects one by one (the gateway paces the
 * requests) until there are none left, `maxSubjects` is reached or the time budget runs out.
 */
export async function runPollCycle(
  deps: PollDeps,
  options: { maxSubjects: number; budgetMs: number },
): Promise<RunSummary> {
  const startedAt = now(deps);
  const started = Date.now();
  await deps.db
    .update(pollerState)
    .set({ lastRunStartedAt: startedAt })
    .where(eq(pollerState.id, 1));
  const expired = await expireAlerts(deps.db, startedAt);
  const windows = await loadRegistrationWindows(deps.db);
  const outcomes: PollOutcome[] = [];
  let runError: string | null = null;
  try {
    while (outcomes.length < options.maxSubjects && Date.now() - started < options.budgetMs) {
      const subject = await claimDueSubject(deps.db, now(deps));
      if (!subject) break;
      const outcome = await pollSubject(deps, subject, windows);
      outcomes.push(outcome);
      // The gateway is paused: the remaining subjects would only be deferred too.
      if (outcome.status === "deferred" && outcome.problem !== "busy") break;
    }
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await deps.db
      .update(pollerState)
      .set({
        lastRunFinishedAt: now(deps),
        lastRunSubjects: outcomes.length,
        lastRunNotifications: outcomes.reduce(
          (total, outcome) => total + (outcome.status === "polled" ? outcome.notifications : 0),
          0,
        ),
        lastRunError: runError,
      })
      .where(eq(pollerState.id, 1));
  }
  return { expired, outcomes };
}
