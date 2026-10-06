import { describe, expect, it } from "vitest";

import { loadSyntheticFixture } from "../test/load-fixture";
import { SiiauParseError } from "./errors";
import { parseOfferPage } from "./offer";

// These tests use hand-written fixtures (test/fixtures/synthetic) that follow docs/siiau.md.
// test/real-fixtures.test.ts runs the same parser over real captures once they exist.

describe("parseOfferPage with several sections", () => {
  const page = parseOfferPage(loadSyntheticFixture("oferta-i5890.html"));
  const byNrc = (nrc: string) => page.sections.find((section) => section.nrc === nrc);

  it("reads the footer and one section per row", () => {
    expect(page.totalRecords).toBe(4);
    expect(page.sections.map((section) => section.nrc)).toEqual([
      "78088",
      "78090",
      "78091",
      "78095",
    ]);
  });

  it("reads the seven data fields of the documented example (NRC 78088)", () => {
    expect(byNrc("78088")).toMatchObject({
      subjectCode: "I5890",
      subjectName: "BASES DE DATOS",
      section: "D02",
      credits: 8,
      capacity: 23,
      available: 21,
    });
  });

  it("keeps every session of a section (one scraper only kept the last one)", () => {
    expect(byNrc("78088")?.sessions).toEqual([
      {
        number: "01",
        start: "13:00",
        end: "14:55",
        days: ["LU"],
        building: "DUCT1",
        room: "LC03",
        startDate: "2026-08-17",
        endDate: "2026-12-11",
      },
      {
        number: "02",
        start: "13:00",
        end: "14:55",
        days: ["JU"],
        building: "DUCT2",
        room: "A007",
        startDate: "2026-08-17",
        endDate: "2026-12-11",
      },
    ]);
  });

  it("reads days by position, whatever letter SIIAU uses", () => {
    expect(byNrc("78090")?.sessions[0]?.days).toEqual(["MA", "JU"]);
    expect(byNrc("78091")?.sessions[0]?.days).toEqual(["MI", "VI"]);
  });

  it("reads one, several or no professors, decoding Ñ and accents", () => {
    expect(byNrc("78088")?.professors).toEqual([{ session: "01", name: "MUÑOZ PEÑA, JOSÉ ÁNGEL" }]);
    expect(byNrc("78090")?.professors.map((p) => p.name)).toEqual([
      "GARCIA LOPEZ, MARIA DE LA LUZ",
      "NUÑEZ IBARRA, LUIS",
    ]);
    expect(byNrc("78091")?.professors).toEqual([]);
  });

  it("collapses &nbsp; and repeated spaces in names", () => {
    expect(byNrc("78095")?.professors[0]?.name).toBe("IBAÑEZ CASTAÑEDA, ANA SOFÍA");
  });

  it("survives rows and cells without end tags", () => {
    expect(byNrc("78091")).toMatchObject({ section: "D04", capacity: 30, available: 3 });
    expect(byNrc("78091")?.sessions).toHaveLength(1);
  });

  it("handles sessions without a schedule", () => {
    expect(byNrc("78095")?.sessions[0]).toMatchObject({
      start: null,
      end: null,
      days: [],
      building: "VIRTU",
      room: null,
    });
  });

  it("ignores markup inside <script>", () => {
    expect(byNrc("99999")).toBeUndefined();
  });
});

describe("parseOfferPage with an unpublished offer", () => {
  it("returns zero sections when the footer says 0", () => {
    expect(parseOfferPage(loadSyntheticFixture("oferta-sin-publicar.html"))).toEqual({
      totalRecords: 0,
      sections: [],
    });
  });
});

describe("parseOfferPage refuses pages it does not understand", () => {
  const SECTION_ROW = (nrc: string, extra = "") =>
    `<tr><td class=tddatos>${nrc}</td><td class=tddatos>I5890</td><td class=tddatos>BASES</td>` +
    `<td class=tddatos>D01</td><td class=tddatos>8</td><td class=tddatos>30</td>` +
    `<td class=tddatos>2</td>${extra}</tr>`;
  const page = (rows: string, total: number) =>
    `<table>${rows}</table><p>Total de registros: ${total}</p>`;

  it("throws when there is no footer (error or maintenance page)", () => {
    expect(() => parseOfferPage(loadSyntheticFixture("pagina-de-error.html"))).toThrow(
      /Total de registros/,
    );
  });

  it("throws when the footer reports records but no rows are recognized", () => {
    expect(() => parseOfferPage(page("<tr><td>78088</td><td>I5890</td></tr>", 1))).toThrow(
      SiiauParseError,
    );
  });

  it("throws when there are more rows than the footer says", () => {
    expect(() => parseOfferPage(page(SECTION_ROW("1") + SECTION_ROW("2"), 1))).toThrow(
      /footer reports 1/,
    );
  });

  it("throws on a repeated NRC", () => {
    expect(() => parseOfferPage(page(SECTION_ROW("1") + SECTION_ROW("1"), 2))).toThrow(
      /appears twice/,
    );
  });

  it("throws when a number field is not a number", () => {
    const row = SECTION_ROW("1").replace(">2</td>", ">dos</td>");

    expect(() => parseOfferPage(page(row, 1))).toThrow(/available \(DIS\)/);
  });

  it.each([
    ["time", "<td>1300 a 1455</td><td>L . . . . .</td>"],
    ["days pattern", "<td>1300-1455</td><td>L . .</td>"],
  ])("throws on an unexpected session %s", (_, cells) => {
    const sessions = `<td><table><tr><td>01</td>${cells}<td>X</td><td>Y</td><td></td></tr></table></td>`;

    expect(() => parseOfferPage(page(SECTION_ROW("1", sessions), 1))).toThrow(SiiauParseError);
  });
});
