import {
  alerts,
  loginTokens,
  notifications,
  offerSnapshots,
  sessions,
  siiauRequests,
  telegramLinkTokens,
  type Database,
} from "@haycupo/db";
import { and, inArray, lt, ne, sql } from "drizzle-orm";

const DAY = 24 * 60 * 60_000;

/**
 * How long each kind of data is kept. The privacy notice (apps/web/src/app/privacidad) promises
 * these numbers: change both together.
 */
export const RETENTION = {
  /** Log of requests to SIIAU, for the status page. No personal data. */
  siiauRequestsDays: 7,
  /** Sent (or failed) messages: who got what, when. */
  notificationsDays: 30,
  /** Alerts that ended (expired, cancelled or fulfilled), shown under "Anteriores". */
  endedAlertsDays: 180,
  /** Cached search results nobody asked for again. */
  offerSnapshotsDays: 30,
  /** Used or expired sign-in links. */
  loginTokensDays: 1,
} as const;

export interface PurgeSummary {
  siiauRequests: number;
  notifications: number;
  alerts: number;
  offerSnapshots: number;
  loginTokens: number;
  sessions: number;
  telegramLinkTokens: number;
}

const ago = (at: Date, days: number) => new Date(at.getTime() - days * DAY);

/** Deletes what is past its retention period. Cheap with the indexes; runs once an hour. */
export async function purgeOldData(db: Database, at: Date): Promise<PurgeSummary> {
  const count = async (query: Promise<unknown[]>) => (await query).length;
  const endedAlerts = and(
    ne(alerts.status, "active"),
    lt(alerts.endedAt, ago(at, RETENTION.endedAlertsDays)),
  );
  // Messages of the alerts about to go, first: nothing cascades on its own (see createDb).
  await db
    .delete(notifications)
    .where(
      inArray(notifications.alertId, db.select({ id: alerts.id }).from(alerts).where(endedAlerts)),
    );
  return {
    siiauRequests: await count(
      db
        .delete(siiauRequests)
        .where(lt(siiauRequests.startedAt, ago(at, RETENTION.siiauRequestsDays)))
        .returning({ id: siiauRequests.id }),
    ),
    notifications: await count(
      db
        .delete(notifications)
        .where(lt(notifications.createdAt, ago(at, RETENTION.notificationsDays)))
        .returning({ id: notifications.id }),
    ),
    alerts: await count(db.delete(alerts).where(endedAlerts).returning({ id: alerts.id })),
    offerSnapshots: await count(
      db
        .delete(offerSnapshots)
        .where(
          sql`coalesce(${offerSnapshots.fetchedAt}, ${offerSnapshots.lastErrorAt}) < ${ago(at, RETENTION.offerSnapshotsDays).getTime()}`,
        )
        .returning({ cycle: offerSnapshots.cycle }),
    ),
    loginTokens: await count(
      db
        .delete(loginTokens)
        .where(lt(loginTokens.expiresAt, ago(at, RETENTION.loginTokensDays)))
        .returning({ hash: loginTokens.tokenHash }),
    ),
    sessions: await count(
      db.delete(sessions).where(lt(sessions.expiresAt, at)).returning({ hash: sessions.idHash }),
    ),
    telegramLinkTokens: await count(
      db
        .delete(telegramLinkTokens)
        .where(lt(telegramLinkTokens.expiresAt, at))
        .returning({ hash: telegramLinkTokens.tokenHash }),
    ),
  };
}

/** The cron runs every minute; the purge only needs to run once an hour. */
export function isPurgeMinute(at: Date): boolean {
  return at.getUTCMinutes() === 17;
}
