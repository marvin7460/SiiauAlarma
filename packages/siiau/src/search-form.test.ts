import { describe, expect, it } from "vitest";

import { loadSyntheticFixture } from "../test/load-fixture";
import { parseSearchForm } from "./search-form";

describe("parseSearchForm", () => {
  const form = parseSearchForm(loadSyntheticFixture("forma-consulta.html"));

  it("reads cycles with their code and description, including special calendars", () => {
    expect(form.cycles).toEqual([
      { code: "202710", label: "Calendario 27 A" },
      { code: "202620", label: "Calendario 26 B" },
      { code: "2026C", label: "Cursos de Verano 2026" },
      { code: "202610", label: "Calendario 26 A" },
    ]);
  });

  it("reads campuses and skips the placeholder option", () => {
    expect(form.centers).toEqual([
      { code: "C", name: "CENTRO UNIVERSITARIO DE CIENCIAS ECONÓMICO ADMINISTRATIVAS" },
      { code: "D", name: "CENTRO UNIVERSITARIO DE CIENCIAS EXACTAS E INGENIERÍAS" },
      { code: "3", name: "CENTRO UNIVERSITARIO DE LOS ALTOS" },
    ]);
  });

  it("throws when the selects are gone", () => {
    expect(() => parseSearchForm("<form><input name=ciclop></form>")).toThrow(/cycle/);
  });
});
