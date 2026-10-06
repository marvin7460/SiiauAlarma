import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHEDULE,
  alertExpiresAt,
  nextPollDelayMs,
  registrationWindowAt,
} from "./schedule";
import type { RegistrationWindow } from "./types";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// 2027A registration: January 11 to 15, 2027, Guadalajara time (UTC-6).
const WINDOWS: RegistrationWindow[] = [
  {
    cycle: "202710",
    startsAt: new Date("2027-01-11T06:00:00Z"),
    endsAt: new Date("2027-01-16T06:00:00Z"),
  },
];
const IN_REGISTRATION = new Date("2027-01-12T18:00:00Z");
const BEFORE = new Date("2026-12-01T18:00:00Z");

describe("registrationWindowAt", () => {
  it("finds the window that contains the moment, for the right cycle", () => {
    expect(registrationWindowAt(WINDOWS, "202710", IN_REGISTRATION)).toBe(WINDOWS[0]);
    expect(registrationWindowAt(WINDOWS, "202620", IN_REGISTRATION)).toBeUndefined();
    expect(registrationWindowAt(WINDOWS, "202710", BEFORE)).toBeUndefined();
    expect(
      registrationWindowAt(WINDOWS, "202710", new Date("2027-01-16T06:00:00Z")),
    ).toBeUndefined();
  });
});

describe("nextPollDelayMs", () => {
  const base = { cycle: "202710", published: true, consecutiveFailures: 0, windows: WINDOWS };

  it("polls every 5 minutes normally", () => {
    expect(nextPollDelayMs({ ...base, now: BEFORE })).toBe(5 * MINUTE);
  });

  it("polls every 2 minutes during the cycle's registration week", () => {
    expect(nextPollDelayMs({ ...base, now: IN_REGISTRATION })).toBe(2 * MINUTE);
  });

  it("polls unpublished offers once an hour", () => {
    expect(nextPollDelayMs({ ...base, now: BEFORE, published: false })).toBe(60 * MINUTE);
  });

  it("backs off exponentially on errors, up to an hour", () => {
    const delays = [1, 2, 3, 4, 10].map((failures) =>
      nextPollDelayMs({ ...base, now: BEFORE, consecutiveFailures: failures }),
    );

    expect(delays).toEqual([10 * MINUTE, 20 * MINUTE, 40 * MINUTE, 60 * MINUTE, 60 * MINUTE]);
  });

  it("uses the schedule it is given", () => {
    const schedule = { ...DEFAULT_SCHEDULE, normalMs: 7 * MINUTE };

    expect(nextPollDelayMs({ ...base, now: BEFORE, schedule })).toBe(7 * MINUTE);
  });
});

describe("alertExpiresAt", () => {
  it("expires at the end of the cycle's registration period", () => {
    expect(
      alertExpiresAt({ kind: "section", cycle: "202710", now: BEFORE, windows: WINDOWS }),
    ).toEqual(WINDOWS[0]?.endsAt);
  });

  it("falls back to 30 days without a known period", () => {
    expect(
      alertExpiresAt({ kind: "subject", cycle: "202620", now: BEFORE, windows: WINDOWS }),
    ).toEqual(new Date(BEFORE.getTime() + 30 * DAY));
  });

  it("gives offer alerts 120 days, since publication can take months", () => {
    expect(
      alertExpiresAt({ kind: "offer", cycle: "202620", now: BEFORE, windows: WINDOWS }),
    ).toEqual(new Date(BEFORE.getTime() + 120 * DAY));
  });

  it("ignores periods that already ended", () => {
    const after = new Date("2027-02-01T00:00:00Z");

    expect(
      alertExpiresAt({ kind: "section", cycle: "202710", now: after, windows: WINDOWS }),
    ).toEqual(new Date(after.getTime() + 30 * DAY));
  });
});
