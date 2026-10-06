import type { SearchForm, Section, Session } from "@haycupo/siiau";

/**
 * Made-up data for the fake SIIAU. Subject codes look like CUCEI's, but sections, rooms and
 * professors are invented ("EJEMPLO"); nothing here describes real people.
 */
export const SEED_FORM: SearchForm = {
  cycles: [
    { code: "202710", label: "Calendario 27 A" },
    { code: "202620", label: "Calendario 26 B" },
  ],
  centers: [
    { code: "D", name: "CENTRO UNIVERSITARIO DE CIENCIAS EXACTAS E INGENIERÍAS" },
    { code: "C", name: "CENTRO UNIVERSITARIO DE CIENCIAS ECONÓMICO ADMINISTRATIVAS" },
  ],
};

const PERIOD = { startDate: "2026-08-17", endDate: "2026-12-11" };

function session(
  number: string,
  start: string,
  end: string,
  days: Session["days"],
  building: string,
  room: string,
): Session {
  return { number, start, end, days, building, room, ...PERIOD };
}

function section(
  nrc: string,
  code: string,
  name: string,
  sectionCode: string,
  capacity: number,
  available: number,
  sessions: Session[],
  professors: string[],
): Section {
  return {
    nrc,
    subjectCode: code,
    subjectName: name,
    section: sectionCode,
    credits: 8,
    capacity,
    available,
    sessions,
    professors: professors.map((professorName) => ({ session: "01", name: professorName })),
  };
}

/** Offers by `${cycle}|${center}`. 202710 is listed in the form but has no sections yet. */
export function seedOffers(): Map<string, Section[]> {
  return new Map([
    [
      "202620|D",
      [
        section(
          "78088",
          "I5890",
          "BASES DE DATOS",
          "D02",
          23,
          0,
          [
            session("01", "13:00", "14:55", ["LU"], "DUCT1", "LC03"),
            session("02", "13:00", "14:55", ["JU"], "DUCT2", "A007"),
          ],
          ["MUÑOZ EJEMPLO, ANA"],
        ),
        section(
          "78090",
          "I5890",
          "BASES DE DATOS",
          "D03",
          40,
          0,
          [session("01", "07:00", "08:55", ["MA", "JU"], "DEDX", "A015")],
          ["PEREZ EJEMPLO, LUIS", "GARCIA EJEMPLO, MARIA"],
        ),
        section(
          "78091",
          "I5890",
          "BASES DE DATOS",
          "D04",
          30,
          5,
          [session("01", "15:00", "16:55", ["MI", "VI"], "DUCT1", "LC10")],
          [],
        ),
        section(
          "78120",
          "I5898",
          "PROGRAMACION",
          "D01",
          35,
          0,
          [session("01", "09:00", "10:55", ["LU", "MI"], "DEDT", "A102")],
          ["LOPEZ EJEMPLO, JORGE"],
        ),
        section(
          "78150",
          "I7024",
          "DISEÑO DE INTERFACES",
          "D01",
          25,
          2,
          [session("01", "11:00", "12:55", ["MA", "JU"], "DUCT2", "LC05")],
          ["NUÑEZ EJEMPLO, SOFIA"],
        ),
      ],
    ],
    ["202620|C", []],
  ]);
}
