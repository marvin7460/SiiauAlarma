import "server-only";

import type { Channel } from "@haycupo/core";
import {
  alerts,
  emailsSentToday,
  notifications,
  pollerState,
  siiauGateway,
  siiauRequests,
  watchedSubjects,
} from "@haycupo/db";
import { APP_VERSION } from "@haycupo/engine";
import { and, count, eq, exists, gt, gte, sql } from "drizzle-orm";

import { getDb } from "./db";
import { serverEnv } from "./env";

const MINUTE = 60_000;
/** The scheduler runs every minute; five minutes without a run means something is wrong. */
const POLLER_LATE_AFTER_MS = 5 * MINUTE;
/** A subject this late (past its next poll time) is waiting too long. */
const SUBJECT_LATE_AFTER_MS = 10 * MINUTE;

export type Overall = "ok" | "degraded" | "paused";

export interface SystemStatus {
  overall: Overall;
  reasons: string[];
  checkedAt: Date;
  app: { version: string; siiauEnabled: boolean; scheduler: boolean };
  gateway: {
    pausedUntil: Date | null;
    pauseReason: string | null;
    consecutiveFailures: number;
    robotsFetchedAt: Date | null;
    robotsStatus: number | null;
  };
  requests: {
    lastHour: number;
    lastDay: number;
    failedLastDay: number;
    lastOkAt: Date | null;
    averageMs: number | null;
  };
  poller: {
    lastRunStartedAt: Date | null;
    lastRunSubjects: number;
    lastRunError: string | null;
  };
  subjects: { watched: number; late: number; failing: number };
  notifications: { pending: number; sentLastDay: Record<Channel, number>; failedLastDay: number };
  email: { sentToday: number; limit: number };
}

/** Everything the public status page shows. No personal data: counts and timestamps only. */
export async function getSystemStatus(now = new Date()): Promise<SystemStatus> {
  const db = getDb();
  const dayAgo = new Date(now.getTime() - 24 * 60 * MINUTE);
  const hourAgo = new Date(now.getTime() - 60 * MINUTE);

  const [[gateway], [requests], [poller], [subjects], [pending], sent, [failed], sentToday] =
    await Promise.all([
      db.select().from(siiauGateway).where(eq(siiauGateway.id, 1)),
      db
        .select({
          lastDay: count(),
          lastHour:
            sql`count(*) filter (where ${siiauRequests.startedAt} >= ${hourAgo.getTime()})`.mapWith(
              Number,
            ),
          failed: sql`count(*) filter (where ${siiauRequests.outcome} <> 'ok')`.mapWith(Number),
          // Milliseconds, or null when there were no successful requests.
          lastOkAt: sql<
            number | null
          >`max(${siiauRequests.startedAt}) filter (where ${siiauRequests.outcome} = 'ok')`,
          // Null when there were no successful requests (mapWith skips nulls).
          averageMs: sql<
            number | null
          >`avg(${siiauRequests.durationMs}) filter (where ${siiauRequests.outcome} = 'ok')`.mapWith(
            Number,
          ),
        })
        .from(siiauRequests)
        .where(gte(siiauRequests.startedAt, dayAgo)),
      db.select().from(pollerState).where(eq(pollerState.id, 1)),
      db
        .select({
          watched: count(),
          late: sql`count(*) filter (where ${watchedSubjects.nextPollAt} < ${now.getTime() - SUBJECT_LATE_AFTER_MS})`.mapWith(
            Number,
          ),
          failing: sql`count(*) filter (where ${watchedSubjects.consecutiveFailures} > 0)`.mapWith(
            Number,
          ),
        })
        .from(watchedSubjects)
        .where(
          exists(
            db
              .select({ one: sql`1` })
              .from(alerts)
              .where(
                and(eq(alerts.watchedSubjectId, watchedSubjects.id), eq(alerts.status, "active")),
              ),
          ),
        ),
      db.select({ total: count() }).from(notifications).where(eq(notifications.status, "pending")),
      db
        .select({ channel: notifications.channel, total: count() })
        .from(notifications)
        .where(and(eq(notifications.status, "sent"), gt(notifications.sentAt, dayAgo)))
        .groupBy(notifications.channel),
      db
        .select({ total: count() })
        .from(notifications)
        .where(and(eq(notifications.status, "failed"), gt(notifications.createdAt, dayAgo))),
      emailsSentToday(db, now),
    ]);

  const sentLastDay: Record<Channel, number> = { email: 0, telegram: 0, push: 0 };
  for (const row of sent) sentLastDay[row.channel] = row.total;

  const status: SystemStatus = {
    overall: "ok",
    reasons: [],
    checkedAt: now,
    app: {
      version: APP_VERSION,
      siiauEnabled: serverEnv().SIIAU_ENABLED,
      scheduler: serverEnv().SCHEDULER_ENABLED,
    },
    gateway: {
      pausedUntil: gateway?.pausedUntil && gateway.pausedUntil > now ? gateway.pausedUntil : null,
      pauseReason: gateway?.pauseReason ?? null,
      consecutiveFailures: gateway?.consecutiveFailures ?? 0,
      robotsFetchedAt: gateway?.robotsFetchedAt ?? null,
      robotsStatus: gateway?.robotsStatus ?? null,
    },
    requests: {
      lastHour: requests?.lastHour ?? 0,
      lastDay: requests?.lastDay ?? 0,
      failedLastDay: requests?.failed ?? 0,
      lastOkAt: requests?.lastOkAt ? new Date(requests.lastOkAt) : null,
      averageMs: requests?.averageMs == null ? null : Math.round(requests.averageMs),
    },
    poller: {
      lastRunStartedAt: poller?.lastRunStartedAt ?? null,
      lastRunSubjects: poller?.lastRunSubjects ?? 0,
      lastRunError: poller?.lastRunError ?? null,
    },
    subjects: {
      watched: subjects?.watched ?? 0,
      late: subjects?.late ?? 0,
      failing: subjects?.failing ?? 0,
    },
    notifications: {
      pending: pending?.total ?? 0,
      sentLastDay,
      failedLastDay: failed?.total ?? 0,
    },
    email: { sentToday, limit: serverEnv().EMAIL_DAILY_LIMIT },
  };
  return judge(status, now);
}

/** Turns the numbers into one word for the top of the page, with the reasons. */
function judge(status: SystemStatus, now: Date): SystemStatus {
  const reasons: string[] = [];
  let overall: Overall = "ok";
  const worse = (level: Overall, reason: string) => {
    reasons.push(reason);
    const rank: Record<Overall, number> = { ok: 0, degraded: 1, paused: 2 };
    if (rank[level] > rank[overall]) overall = level;
  };

  if (!status.app.siiauEnabled) {
    worse("paused", "Las consultas a SIIAU están apagadas a propósito.");
  }
  if (status.gateway.pausedUntil) {
    const manual = status.gateway.pauseReason?.startsWith("pausa manual") ?? false;
    worse(
      manual ? "paused" : "degraded",
      manual
        ? "Pausamos las consultas a SIIAU a propósito."
        : "SIIAU falló varias veces seguidas; esperamos antes de volver a intentar.",
    );
  }
  const lastRun = status.poller.lastRunStartedAt;
  if (!lastRun || now.getTime() - lastRun.getTime() > POLLER_LATE_AFTER_MS) {
    worse("degraded", "Las revisiones programadas no han corrido en los últimos minutos.");
  }
  if (status.subjects.late > 0) {
    worse("degraded", "Algunas materias llevan más tiempo del normal sin revisarse.");
  }
  if (status.email.sentToday >= status.email.limit) {
    worse("degraded", "Llegamos al límite diario de correos; Telegram y notificaciones siguen.");
  }
  return { ...status, overall, reasons };
}
