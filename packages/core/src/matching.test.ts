import { describe, expect, it } from "vitest";

import { alertWantsSection, matchesFilters } from "./matching";
import { makeSection, makeSession } from "./test-helpers";
import type { AlertFilters } from "./types";

describe("matchesFilters", () => {
  const section = makeSection({
    sessions: [makeSession({ days: ["LU", "JU"], start: "13:00", end: "14:55" })],
    professors: [{ session: "01", name: "MUÑOZ PEÑA, JOSÉ" }],
  });

  it("matches anything without filters", () => {
    expect(matchesFilters(section, {})).toBe(true);
  });

  it.each<[AlertFilters, boolean]>([
    [{ days: ["LU", "JU", "VI"] }, true],
    [{ days: ["LU"] }, false],
    [{ startAfter: "13:00" }, true],
    [{ startAfter: "13:01" }, false],
    [{ endBefore: "14:55" }, true],
    [{ endBefore: "14:00" }, false],
    [{ professor: "muñoz" }, true],
    [{ professor: "Jose" }, true],
    [{ professor: "GARCIA" }, false],
    [{ days: ["LU", "JU"], startAfter: "07:00", endBefore: "15:00", professor: "PEÑA" }, true],
  ])("filters %j → %s", (filters, expected) => {
    expect(matchesFilters(section, filters)).toBe(expected);
  });

  it("requires every session to fit", () => {
    const twoSessions = makeSection({
      sessions: [makeSession({ days: ["LU"] }), makeSession({ number: "02", days: ["SA"] })],
    });

    expect(matchesFilters(twoSessions, { days: ["LU", "MA", "MI", "JU", "VI"] })).toBe(false);
  });

  it("lets sessions without a schedule pass time and day filters", () => {
    const online = makeSection({
      sessions: [makeSession({ days: [], start: null, end: null, building: "VIRTU" })],
    });

    expect(matchesFilters(online, { days: ["LU"], startAfter: "18:00", endBefore: "07:00" })).toBe(
      true,
    );
  });
});

describe("alertWantsSection", () => {
  const section = makeSection({ nrc: "78088" });

  it("matches a section alert by NRC only", () => {
    expect(alertWantsSection({ kind: "section", nrc: "78088", filters: {} }, section)).toBe(true);
    expect(alertWantsSection({ kind: "section", nrc: "11111", filters: {} }, section)).toBe(false);
  });

  it("matches a subject alert through its filters", () => {
    expect(alertWantsSection({ kind: "subject", nrc: null, filters: {} }, section)).toBe(true);
    expect(
      alertWantsSection({ kind: "subject", nrc: null, filters: { days: ["MA"] } }, section),
    ).toBe(false);
  });

  it("never matches sections for an offer alert", () => {
    expect(alertWantsSection({ kind: "offer", nrc: null, filters: {} }, section)).toBe(false);
  });
});
