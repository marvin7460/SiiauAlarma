import { describe, expect, it } from "vitest";

import { parseOfferPage } from "../src/offer";
import { parseSearchForm } from "../src/search-form";
import { listRealFixtures } from "./load-fixture";

// Runs the parsers over real captures saved by `pnpm capture` (test/fixtures/*.html).
// Until the first capture is committed there is nothing to run, and these tests are skipped.
// Every real capture must parse cleanly: if SIIAU changes its HTML, this is the test that fails.

const offers = listRealFixtures("oferta-");
const forms = listRealFixtures("forma-consulta");

describe.skipIf(offers.length === 0)("real offer captures", () => {
  it.each(offers.map((fixture) => [fixture.name, fixture] as const))("%s parses", (_, fixture) => {
    const page = parseOfferPage(fixture.html);
    const pageSize = Number(new URL(fixture.meta.request.url).searchParams.get("mostrarp") ?? 500);

    if (page.totalRecords <= pageSize) {
      expect(page.sections).toHaveLength(page.totalRecords);
    } else {
      // A page of a larger result: full page, and the footer reports the grand total.
      expect(page.sections).toHaveLength(pageSize);
    }
    for (const section of page.sections) {
      expect(section.capacity).toBeGreaterThanOrEqual(0);
      expect(section.sessions.every((s) => s.days.length > 0 || s.start === null)).toBe(true);
    }
  });
});

describe.skipIf(forms.length === 0)("real search form capture", () => {
  it.each(forms.map((fixture) => [fixture.name, fixture] as const))("%s parses", (_, fixture) => {
    const form = parseSearchForm(fixture.html);

    expect(form.cycles.length).toBeGreaterThan(0);
    expect(form.centers.map((center) => center.code)).toContain("D");
  });
});
