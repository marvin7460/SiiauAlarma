import type { AlertKind, RegistrationWindow } from "./types";

export interface PollSchedule {
  /** Usual interval per subject (5 minutes). */
  normalMs: number;
  /** During the cycle's registration week (2 minutes; never less, enforced by config). */
  registrationMs: number;
  /** Subjects whose offer is not published yet (1 hour). */
  unpublishedMs: number;
  /** Ceiling for the error backoff (1 hour). */
  maxBackoffMs: number;
}

export const DEFAULT_SCHEDULE: PollSchedule = {
  normalMs: 5 * 60_000,
  registrationMs: 2 * 60_000,
  unpublishedMs: 60 * 60_000,
  maxBackoffMs: 60 * 60_000,
};

export function registrationWindowAt(
  windows: readonly RegistrationWindow[],
  cycle: string,
  now: Date,
): RegistrationWindow | undefined {
  return windows.find(
    (window) =>
      window.cycle === cycle &&
      window.startsAt.getTime() <= now.getTime() &&
      now.getTime() < window.endsAt.getTime(),
  );
}

export interface NextPollInput {
  now: Date;
  cycle: string;
  /** false: SIIAU has no sections for the subject yet. */
  published: boolean;
  /** Failed polls in a row for this subject. */
  consecutiveFailures: number;
  windows: readonly RegistrationWindow[];
  schedule?: PollSchedule;
}

/**
 * How long until this subject is polled again. Errors back off exponentially (base interval
 * doubled per failure in a row, capped), so a failing SIIAU gets fewer requests, not more.
 */
export function nextPollDelayMs(input: NextPollInput): number {
  const schedule = input.schedule ?? DEFAULT_SCHEDULE;
  const base = !input.published
    ? schedule.unpublishedMs
    : registrationWindowAt(input.windows, input.cycle, input.now)
      ? schedule.registrationMs
      : schedule.normalMs;
  if (input.consecutiveFailures <= 0) return base;
  return Math.min(base * 2 ** input.consecutiveFailures, Math.max(schedule.maxBackoffMs, base));
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * When an alert stops on its own: at the end of the cycle's registration period, which is
 * when seats stop mattering. Without a known period, after 30 days (120 for "tell me when the
 * offer is published", which can take months).
 */
export function alertExpiresAt(input: {
  kind: AlertKind;
  cycle: string;
  now: Date;
  windows: readonly RegistrationWindow[];
}): Date {
  const upcoming = input.windows
    .filter(
      (window) => window.cycle === input.cycle && window.endsAt.getTime() > input.now.getTime(),
    )
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())[0];
  if (upcoming) return upcoming.endsAt;
  const days = input.kind === "offer" ? 120 : 30;
  return new Date(input.now.getTime() + days * DAY_MS);
}
