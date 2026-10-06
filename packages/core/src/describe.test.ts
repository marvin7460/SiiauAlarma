import { describe, expect, it } from "vitest";

import { describeAlert, type DescribableAlert } from "./describe";
import type { AlertFilters } from "./types";

const BASE: DescribableAlert = {
  kind: "subject",
  nrc: null,
  subjectCode: "I5890",
  subjectName: "BASES DE DATOS",
  filters: {},
};

describe("describeAlert", () => {
  it.each([
    [{ ...BASE, kind: "section", nrc: "78088" }, "NRC 78088 de I5890 BASES DE DATOS"],
    [BASE, "Cualquier sección de I5890 BASES DE DATOS"],
    [{ ...BASE, kind: "offer", subjectName: null }, "Cuando publiquen la oferta de I5890"],
  ] as const)("%#: %s", (alert, expected) => {
    expect(describeAlert(alert)).toBe(expected);
  });
});

// TODO(Marvin): remove `.skip` when describeAlert includes the filters (see describe.ts).
describe.skip("describeAlert with filters", () => {
  it.each<[AlertFilters, string]>([
    [{ days: ["LU", "JU"] }, "Cualquier sección de I5890 BASES DE DATOS, solo lunes y jueves"],
    [
      { startAfter: "07:00", endBefore: "13:00" },
      "Cualquier sección de I5890 BASES DE DATOS, entre 07:00 y 13:00",
    ],
    [{ startAfter: "11:00" }, "Cualquier sección de I5890 BASES DE DATOS, desde las 11:00"],
    [{ endBefore: "15:00" }, "Cualquier sección de I5890 BASES DE DATOS, hasta las 15:00"],
    [{ professor: "perez" }, "Cualquier sección de I5890 BASES DE DATOS, con PEREZ"],
    [
      { days: ["MA"], startAfter: "09:00", professor: "LOPEZ" },
      "Cualquier sección de I5890 BASES DE DATOS, solo martes, desde las 09:00, con LOPEZ",
    ],
  ])("%j", (filters, expected) => {
    expect(describeAlert({ ...BASE, filters })).toBe(expected);
  });
});
