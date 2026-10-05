import { describe, expect, it } from "vitest";

import { SIIAU_PAGES, buildRobotsTxtUrl, buildSiiauUrl } from "./endpoints";

describe("buildSiiauUrl", () => {
  it("builds the offer URL used in docs/siiau.md", () => {
    const url = buildSiiauUrl("current", SIIAU_PAGES.offer, {
      ciclop: "202620",
      cup: "D",
      crsep: "I5890",
      mostrarp: "500",
    });

    expect(url.href).toBe(
      "https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta?ciclop=202620&cup=D&crsep=I5890&mostrarp=500",
    );
  });

  it("uses the legacy HTTP host when asked", () => {
    const url = buildSiiauUrl("legacy", SIIAU_PAGES.catalogByMajor, { carrerap: "INNI" });

    expect(url.href).toBe("http://consulta.siiau.udg.mx/wco/scpcata.cataxcarr?carrerap=INNI");
  });

  it("encodes parameter values", () => {
    const url = buildSiiauUrl("current", SIIAU_PAGES.offer, { clasep: "BASES DE DATOS & MÁS" });

    expect(url.searchParams.get("clasep")).toBe("BASES DE DATOS & MÁS");
    expect(url.search).not.toContain(" ");
  });

  it("rejects page names that could escape the base path", () => {
    expect(() => buildSiiauUrl("current", "../robots.txt")).toThrow(/Invalid SIIAU page/);
    expect(() => buildSiiauUrl("current", "https://example.com/x.y")).toThrow(/Invalid SIIAU page/);
  });
});

describe("buildRobotsTxtUrl", () => {
  it("points at the root of each host", () => {
    expect(buildRobotsTxtUrl("current").href).toBe("https://siiauescolar.siiau.udg.mx/robots.txt");
    expect(buildRobotsTxtUrl("legacy").href).toBe("http://consulta.siiau.udg.mx/robots.txt");
  });
});
