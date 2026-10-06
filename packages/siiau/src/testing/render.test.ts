import { describe, expect, it } from "vitest";

import { decodeSiiauBody } from "../encoding";
import type { Section } from "../model";
import { parseOfferPage } from "../offer";
import { parseSearchForm } from "../search-form";
import { encodeLatin1, renderOfferPage, renderSearchForm } from "./render";

const SECTIONS: Section[] = [
  {
    nrc: "78088",
    subjectCode: "I5890",
    subjectName: "BASES DE DATOS",
    section: "D02",
    credits: 8,
    capacity: 23,
    available: 0,
    sessions: [
      {
        number: "01",
        start: "13:00",
        end: "14:55",
        days: ["LU", "JU"],
        building: "DUCT1",
        room: "LC03",
        startDate: "2026-08-17",
        endDate: "2026-12-11",
      },
      {
        number: "02",
        start: null,
        end: null,
        days: [],
        building: "VIRTU",
        room: null,
        startDate: null,
        endDate: null,
      },
    ],
    professors: [
      { session: "01", name: "MUÑOZ PEÑA, JOSÉ ÁNGEL" },
      { session: null, name: "LOPEZ & HIJOS <SA>" },
    ],
  },
  {
    nrc: "78090",
    subjectCode: "I5890",
    subjectName: "BASES DE DATOS",
    section: "D03",
    credits: 8,
    capacity: 40,
    available: 3,
    sessions: [],
    professors: [],
  },
];

describe("renderOfferPage", () => {
  it("renders pages the parser reads back exactly (round trip through ISO-8859-1)", () => {
    const bytes = encodeLatin1(renderOfferPage(SECTIONS));

    expect(parseOfferPage(decodeSiiauBody(bytes))).toEqual({
      totalRecords: 2,
      sections: SECTIONS,
    });
  });

  it("renders an empty offer", () => {
    expect(parseOfferPage(renderOfferPage([]))).toEqual({ totalRecords: 0, sections: [] });
  });
});

describe("renderSearchForm", () => {
  it("round-trips cycles and campuses", () => {
    const form = {
      cycles: [{ code: "202710", label: "Calendario 27 A" }],
      centers: [{ code: "D", name: "CENTRO UNIVERSITARIO DE CIENCIAS EXACTAS E INGENIERÍAS" }],
    };

    expect(parseSearchForm(renderSearchForm(form))).toEqual(form);
  });
});

describe("encodeLatin1", () => {
  it("refuses characters outside ISO-8859-1", () => {
    expect(() => encodeLatin1("€")).toThrow(/ISO-8859-1/);
  });
});
