import type { Section } from "@haycupo/siiau";

import type { Changes } from "./changes";
import { alertWantsSection } from "./matching";
import type { AlertRule } from "./types";

/**
 * Anti-spam: an alert notifies at most once per `cooldownMs`. If a seat appears, disappears
 * and appears again within minutes (someone dropped and someone else took it), the student
 * gets one message, not three.
 */
export function shouldNotify(
  alert: Pick<AlertRule, "lastNotifiedAt" | "expiresAt">,
  now: Date,
  cooldownMs: number,
): boolean {
  if (alert.expiresAt.getTime() <= now.getTime()) return false;
  if (alert.lastNotifiedAt === null) return true;
  return now.getTime() - alert.lastNotifiedAt.getTime() >= cooldownMs;
}

export type NotificationReason = "seat_opened" | "offer_published";

export interface PlannedNotification {
  alertId: string;
  reason: NotificationReason;
  /** Sections the student should look at (opened seats, or every section of a new offer). */
  sections: Section[];
}

/**
 * Who gets a message after a poll. One message per alert, listing every section that matters
 * to it, so a subject alert with three opened sections sends one email, not three.
 */
export function planNotifications(
  alerts: readonly AlertRule[],
  changes: Changes,
  current: readonly Section[],
  now: Date,
  cooldownMs: number,
): PlannedNotification[] {
  if (changes.baseline) return [];
  const planned: PlannedNotification[] = [];
  for (const alert of alerts) {
    if (!shouldNotify(alert, now, cooldownMs)) continue;
    if (alert.kind === "offer") {
      if (changes.published) {
        planned.push({ alertId: alert.id, reason: "offer_published", sections: [...current] });
      }
      continue;
    }
    const sections = changes.opened.filter((section) => alertWantsSection(alert, section));
    if (sections.length > 0) planned.push({ alertId: alert.id, reason: "seat_opened", sections });
  }
  return planned;
}
