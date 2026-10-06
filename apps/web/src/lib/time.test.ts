import { describe, expect, it } from "vitest";

import { formatClockTime, formatRelativeTime } from "./time";

const NOW = new Date("2026-10-06T19:00:00Z"); // 13:00 in Guadalajara
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;

describe("formatClockTime", () => {
  it("uses Guadalajara's time zone", () => {
    expect(formatClockTime(NOW)).toBe("13:00");
  });
});

// TODO(Marvin): remove `.skip` when you implement formatRelativeTime (see time.ts).
describe.skip("formatRelativeTime", () => {
  it.each([
    [ago(10_000), "hace un momento"],
    [new Date(NOW.getTime() + 5000), "hace un momento"],
    [ago(1 * MINUTE), "hace 1 minuto"],
    [ago(3 * MINUTE + 59_000), "hace 3 minutos"],
    [ago(59 * MINUTE), "hace 59 minutos"],
    [ago(60 * MINUTE), "hace 1 hora"],
    [ago(5 * 60 * MINUTE), "hace 5 horas"],
    [ago(24 * 60 * MINUTE), "hace 1 día"],
    [ago(3 * 24 * 60 * MINUTE), "hace 3 días"],
  ])("%s → %s", (date, expected) => {
    expect(formatRelativeTime(date, NOW)).toBe(expected);
  });
});

describe("formatRelativeTime (until Marvin's version lands)", () => {
  it("falls back to the clock time", () => {
    expect(formatRelativeTime(ago(3 * MINUTE), NOW)).toBe("a las 12:57");
  });
});
