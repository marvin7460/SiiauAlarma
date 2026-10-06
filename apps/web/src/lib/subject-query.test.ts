import { describe, expect, it } from "vitest";

import { classifySubject, parseSearchParams, searchHref } from "./subject-query";

describe("classifySubject", () => {
  it.each([
    ["I5890", { kind: "code", value: "I5890" }],
    [" i5890 ", { kind: "code", value: "I5890" }],
    ["IL355", { kind: "code", value: "IL355" }],
    ["bases de datos", { kind: "name", value: "bases de datos" }],
    ["  diseño   web ", { kind: "name", value: "diseño web" }],
    ["calculo", { kind: "name", value: "calculo" }],
  ] as const)("%j → %j", (input, expected) => {
    expect(classifySubject(input)).toEqual(expected);
  });
});

describe("parseSearchParams", () => {
  it("reads a complete search", () => {
    expect(parseSearchParams({ ciclo: "202620", centro: "D", materia: "I5890" })).toEqual({
      cycle: "202620",
      center: "D",
      kind: "code",
      value: "I5890",
    });
  });

  it("takes the first value of repeated params", () => {
    expect(
      parseSearchParams({ ciclo: ["202620", "x"], centro: "D", materia: "bases" })?.cycle,
    ).toBe("202620");
  });

  it.each([
    {},
    { ciclo: "202620", centro: "D" },
    { ciclo: "2026'", centro: "D", materia: "I5890" },
    { ciclo: "202620", centro: "DDD", materia: "I5890" },
    { ciclo: "202620", centro: "D", materia: "x" },
  ])("returns null for an incomplete or invalid search %#", (params) => {
    expect(parseSearchParams(params)).toBeNull();
  });
});

describe("searchHref", () => {
  it("builds a shareable URL", () => {
    expect(searchHref({ cycle: "202620", center: "D", value: "bases de datos" })).toBe(
      "/buscar?ciclo=202620&centro=D&materia=bases+de+datos",
    );
  });
});
