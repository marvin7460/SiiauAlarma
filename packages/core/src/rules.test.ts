import { describe, expect, it } from "vitest";

import { detectChanges } from "./changes";
import { planNotifications, shouldNotify } from "./rules";
import { makeSection } from "./test-helpers";
import type { AlertRule } from "./types";

const NOW = new Date("2027-01-11T16:00:00Z");
const MINUTE = 60_000;
const COOLDOWN = 30 * MINUTE;
const LATER = new Date("2027-01-16T06:00:00Z");

function alert(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "a1",
    kind: "section",
    nrc: "78088",
    filters: {},
    lastNotifiedAt: null,
    expiresAt: LATER,
    ...overrides,
  };
}

describe("shouldNotify", () => {
  it("notifies an alert that never notified", () => {
    expect(shouldNotify(alert(), NOW, COOLDOWN)).toBe(true);
  });

  it("stays quiet during the cooldown", () => {
    const recent = alert({ lastNotifiedAt: new Date(NOW.getTime() - 29 * MINUTE) });

    expect(shouldNotify(recent, NOW, COOLDOWN)).toBe(false);
  });

  it("notifies again once the cooldown has passed", () => {
    const old = alert({ lastNotifiedAt: new Date(NOW.getTime() - 30 * MINUTE) });

    expect(shouldNotify(old, NOW, COOLDOWN)).toBe(true);
  });

  it("never notifies an expired alert", () => {
    expect(shouldNotify(alert({ expiresAt: NOW }), NOW, COOLDOWN)).toBe(false);
  });
});

describe("planNotifications", () => {
  const before = {
    available: new Map([
      ["78088", 0],
      ["78090", 0],
    ]),
    published: true,
  };
  const open88 = makeSection({ nrc: "78088", available: 1 });
  const open90 = makeSection({ nrc: "78090", available: 2, professors: [] });
  const current = [open88, open90];
  const changes = detectChanges(before, current);

  it("sends exactly one notification per alert, listing every matching section", () => {
    const subjectAlert = alert({ id: "subject", kind: "subject", nrc: null });

    expect(planNotifications([subjectAlert], changes, current, NOW, COOLDOWN)).toEqual([
      { alertId: "subject", reason: "seat_opened", sections: [open88, open90] },
    ]);
  });

  it("notifies a section alert only for its NRC", () => {
    const planned = planNotifications([alert({ nrc: "78090" })], changes, current, NOW, COOLDOWN);

    expect(planned.map((p) => p.sections.map((s) => s.nrc))).toEqual([["78090"]]);
  });

  it("applies the filters of subject alerts", () => {
    const withProfessor = alert({ kind: "subject", nrc: null, filters: { professor: "PEREZ" } });

    const planned = planNotifications([withProfessor], changes, current, NOW, COOLDOWN);
    expect(planned[0]?.sections.map((s) => s.nrc)).toEqual(["78088"]);
  });

  it("skips alerts in cooldown and alerts without matching sections", () => {
    const inCooldown = alert({ id: "x", lastNotifiedAt: new Date(NOW.getTime() - MINUTE) });
    const other = alert({ id: "y", nrc: "11111" });

    expect(planNotifications([inCooldown, other], changes, current, NOW, COOLDOWN)).toEqual([]);
  });

  it("sends nothing on a baseline poll", () => {
    expect(
      planNotifications([alert()], detectChanges(null, current), current, NOW, COOLDOWN),
    ).toEqual([]);
  });

  it("tells offer alerts when sections are published, with every section", () => {
    const offer = alert({ id: "offer", kind: "offer", nrc: null });
    const published = detectChanges({ available: new Map(), published: false }, current);

    expect(planNotifications([offer], published, current, NOW, COOLDOWN)).toEqual([
      { alertId: "offer", reason: "offer_published", sections: current },
    ]);
  });
});
