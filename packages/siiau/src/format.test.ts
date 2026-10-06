import { describe, expect, it } from "vitest";

import { formatDays, formatProfessorName, formatSession, formatTimeRange } from "./format";
import type { Session } from "./model";

const SESSION: Session = {
  number: "01",
  start: "13:00",
  end: "14:55",
  days: ["LU", "JU"],
  building: "DUCT1",
  room: "LC03",
  startDate: "2026-08-17",
  endDate: "2026-12-11",
};

describe("formatDays", () => {
  it.each([
    [[], ""],
    [["LU"], "lunes"],
    [["LU", "JU"], "lunes y jueves"],
    [["LU", "MI", "VI"], "lunes, miércoles y viernes"],
  ] as const)("%j → %s", (days, text) => {
    expect(formatDays(days)).toBe(text);
  });
});

describe("formatTimeRange and formatSession", () => {
  it("formats a scheduled session", () => {
    expect(formatTimeRange(SESSION)).toBe("13:00–14:55");
    expect(formatSession(SESSION)).toBe("lunes y jueves, 13:00–14:55 · DUCT1 LC03");
  });

  it("says when there is no schedule", () => {
    const virtual = { ...SESSION, start: null, end: null, days: [], room: null, building: "VIRTU" };

    expect(formatTimeRange(virtual)).toBe("");
    expect(formatSession(virtual)).toBe("Sin horario · VIRTU");
  });
});

// TODO(Marvin): remove `.skip` when you implement formatProfessorName (see format.ts).
describe.skip("formatProfessorName", () => {
  it.each([
    ["MUÑOZ PEÑA, JOSE ANGEL", "Jose Angel Muñoz Peña"],
    ["GARCIA LOPEZ, MARIA DE LA LUZ", "Maria de la Luz Garcia Lopez"],
    ["DE LA TORRE SANCHEZ, LUIS", "Luis De la Torre Sanchez"],
    ["  IBAÑEZ   CASTAÑEDA ,  ANA SOFIA ", "Ana Sofia Ibañez Castañeda"],
    ["ROMERO Y ROMERO, ANA", "Ana Romero y Romero"],
    ["LOPEZ", "Lopez"],
    ["", ""],
  ])("%j → %j", (raw, expected) => {
    expect(formatProfessorName(raw)).toBe(expected);
  });
});
