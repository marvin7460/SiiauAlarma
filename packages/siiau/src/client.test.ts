import { describe, expect, it, vi } from "vitest";

import { readFixtureBytes } from "../test/load-fixture";
import {
  InvalidQueryError,
  buildOfferUrl,
  fetchOffer,
  fetchSearchForm,
  normalizeSubjectCode,
  normalizeSubjectName,
  type SiiauFetcher,
} from "./client";
import { SiiauHttpError, SiiauIncompleteResultsError } from "./errors";

const SYNTHETIC = new URL("../test/fixtures/synthetic/", import.meta.url);

function fakeFetcher(fixture: string, status = 200): SiiauFetcher {
  return vi.fn(() =>
    Promise.resolve({
      status,
      contentType: "text/html; charset=ISO-8859-1",
      bytes: readFixtureBytes(fixture, SYNTHETIC),
    }),
  );
}

describe("buildOfferUrl", () => {
  it("builds the query by subject code, normalizing it", () => {
    const url = buildOfferUrl({ cycle: "202620", center: "D", subjectCode: " i5890 " });

    expect(url.href).toBe(
      "https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta?ciclop=202620&cup=D&crsep=I5890&mostrarp=500",
    );
  });

  it("builds the query by subject name, in SIIAU's uppercase without accents", () => {
    const url = buildOfferUrl({ cycle: "202620", center: "D", subjectName: "Diseño  básico" });

    expect(url.searchParams.get("clasep")).toBe("DISEÑO BASICO");
  });

  it.each([
    [{ cycle: "2026'", center: "D", subjectCode: "I5890" }, /cycle/],
    [{ cycle: "202620", center: "DD;", subjectCode: "I5890" }, /campus/],
    [{ cycle: "202620", center: "D", subjectCode: "I5890&x=1" }, /subject code/],
    [{ cycle: "202620", center: "D", subjectName: "<script>" }, /subject name/],
    [{ cycle: "202620", center: "D" }, /required/],
  ])("rejects invalid input %#", (query, message) => {
    expect(() => buildOfferUrl(query)).toThrow(InvalidQueryError);
    expect(() => buildOfferUrl(query)).toThrow(message);
  });
});

describe("normalizers", () => {
  it("normalizes codes and names", () => {
    expect(normalizeSubjectCode("i 5890")).toBe("I5890");
    expect(normalizeSubjectName("  español   y ñandú ")).toBe("ESPAÑOL Y ÑANDU");
  });
});

describe("fetchOffer", () => {
  it("fetches, decodes and parses one subject", async () => {
    const fetcher = fakeFetcher("oferta-i5890.html");

    const page = await fetchOffer(fetcher, { cycle: "202620", center: "D", subjectCode: "I5890" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(page.sections).toHaveLength(4);
    expect(page.sections[0]?.professors[0]?.name).toBe("MUÑOZ PEÑA, JOSÉ ÁNGEL");
  });

  it("turns non-200 answers into SiiauHttpError", async () => {
    await expect(
      fetchOffer(fakeFetcher("pagina-de-error.html", 503), {
        cycle: "202620",
        center: "D",
        subjectCode: "I5890",
      }),
    ).rejects.toBeInstanceOf(SiiauHttpError);
  });

  it("rejects incomplete pages instead of returning part of the sections", async () => {
    const fetcher: SiiauFetcher = () =>
      Promise.resolve({
        status: 200,
        contentType: null,
        bytes: new TextEncoder().encode(
          "<table><tr><td class=tddatos>1</td><td class=tddatos>I5890</td><td class=tddatos>B</td>" +
            "<td class=tddatos>D01</td><td class=tddatos>8</td><td class=tddatos>3</td>" +
            "<td class=tddatos>0</td></tr></table>Total de registros: 2",
        ),
      });

    await expect(
      fetchOffer(fetcher, { cycle: "202620", center: "D", subjectCode: "I5890" }),
    ).rejects.toBeInstanceOf(SiiauIncompleteResultsError);
  });
});

describe("fetchSearchForm", () => {
  it("reads cycles and campuses", async () => {
    const form = await fetchSearchForm(fakeFetcher("forma-consulta.html"));

    expect(form.cycles[0]?.code).toBe("202710");
    expect(form.centers.map((center) => center.code)).toEqual(["C", "D", "3"]);
  });
});
