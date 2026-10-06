import { describe, expect, it } from "vitest";

import { detectChanges, type PreviousPoll } from "./changes";
import { makeSection } from "./test-helpers";

const previous = (seats: Record<string, number>, published = true): PreviousPoll => ({
  available: new Map(Object.entries(seats)),
  published,
});

describe("detectChanges", () => {
  it("reports nothing on the first poll (baseline)", () => {
    const changes = detectChanges(null, [makeSection({ available: 5 })]);

    expect(changes).toEqual({ baseline: true, opened: [], closed: [], published: false });
  });

  it("detects a seat that opens: 0 → 1", () => {
    const section = makeSection({ available: 1 });

    expect(detectChanges(previous({ "78088": 0 }), [section]).opened).toEqual([section]);
  });

  it("treats negative counts like zero", () => {
    expect(
      detectChanges(previous({ "78088": -2 }), [makeSection({ available: 1 })]).opened,
    ).toHaveLength(1);
  });

  it("ignores sections that already had seats: 3 → 2 is not news", () => {
    const changes = detectChanges(previous({ "78088": 3 }), [makeSection({ available: 2 })]);

    expect(changes.opened).toEqual([]);
    expect(changes.closed).toEqual([]);
  });

  it("detects a seat that closes: 1 → 0", () => {
    const section = makeSection({ available: 0 });

    expect(detectChanges(previous({ "78088": 1 }), [section]).closed).toEqual([section]);
  });

  it("counts a new section that appears with seats as opened", () => {
    const added = makeSection({ nrc: "99999", available: 4 });

    expect(detectChanges(previous({ "78088": 0 }), [makeSection(), added]).opened).toEqual([added]);
  });

  it("detects a newly published offer", () => {
    const changes = detectChanges(previous({}, false), [makeSection({ available: 0 })]);

    expect(changes.published).toBe(true);
    expect(changes.opened).toEqual([]);
  });

  it("does not call a still-empty offer published", () => {
    expect(detectChanges(previous({}, false), []).published).toBe(false);
  });
});
