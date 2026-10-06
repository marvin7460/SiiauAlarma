import type { Section, Weekday } from "@haycupo/siiau";

/**
 * - section: one NRC.
 * - subject: any section of the subject that passes the filters.
 * - offer: the subject has no sections yet in that cycle; tell me when they are published.
 */
export type AlertKind = "section" | "subject" | "offer";

export type Channel = "email" | "telegram" | "push";

export const CHANNELS: readonly Channel[] = ["email", "telegram", "push"];

/** Optional filters for `subject` alerts. Every session of a section must satisfy them. */
export interface AlertFilters {
  /** Days the student is free. Sessions on other days rule the section out. */
  days?: Weekday[];
  /** "HH:MM": sessions must start at or after this time. */
  startAfter?: string;
  /** "HH:MM": sessions must end at or before this time. */
  endBefore?: string;
  /** Part of a professor's name, e.g. "PEREZ". */
  professor?: string;
}

/** The part of an alert the rules need. */
export interface AlertRule {
  id: string;
  kind: AlertKind;
  nrc: string | null;
  filters: AlertFilters;
  lastNotifiedAt: Date | null;
  expiresAt: Date;
}

/**
 * Everything a channel needs to write one notification, frozen when the change is detected:
 * the message describes what SIIAU showed at that moment, even if it is sent a minute later.
 */
export interface NotificationPayload {
  reason: "seat_opened" | "offer_published";
  subject: { cycle: string; center: string; code: string; name: string | null };
  alert: { id: string; kind: AlertKind; nrc: string | null; filters: AlertFilters };
  sections: Section[];
  /** When the poll saw the change (ISO 8601). */
  detectedAt: string;
}

/** Registration period of a cycle (e.g. 2027A: January 11–15, 2027). */
export interface RegistrationWindow {
  cycle: string;
  startsAt: Date;
  endsAt: Date;
}
