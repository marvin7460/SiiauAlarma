import type { Section, Session } from "@haycupo/siiau";

/** A section with sensible defaults, for tests. */
export function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    nrc: "78088",
    subjectCode: "I5890",
    subjectName: "BASES DE DATOS",
    section: "D02",
    credits: 8,
    capacity: 30,
    available: 0,
    sessions: [makeSession()],
    professors: [{ session: "01", name: "PEREZ EJEMPLO, LUIS" }],
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    number: "01",
    start: "13:00",
    end: "14:55",
    days: ["LU", "JU"],
    building: "DUCT1",
    room: "LC03",
    startDate: "2026-08-17",
    endDate: "2026-12-11",
    ...overrides,
  };
}
