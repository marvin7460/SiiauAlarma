import { fetchOffer, fetchSearchForm } from "@haycupo/siiau";
import { describe, expect, it } from "vitest";

import { FakeSiiau } from "./fake-siiau";

describe("FakeSiiau", () => {
  it("serves the form and offers that the real parser reads", async () => {
    const fake = new FakeSiiau();

    const form = await fetchSearchForm(fake.fetcher());
    const page = await fetchOffer(fake.fetcher(), {
      cycle: "202620",
      center: "D",
      subjectCode: "I5890",
    });

    expect(form.cycles.map((cycle) => cycle.code)).toEqual(["202710", "202620"]);
    expect(page.sections.map((section) => section.nrc)).toEqual(["78088", "78090", "78091"]);
  });

  it("searches by name without accents and keeps Ñ", async () => {
    const page = await fetchOffer(new FakeSiiau().fetcher(), {
      cycle: "202620",
      center: "D",
      subjectName: "diseño",
    });

    expect(page.sections.map((section) => section.subjectName)).toEqual(["DISEÑO DE INTERFACES"]);
  });

  it("has no sections for a cycle that is not published yet", async () => {
    const page = await fetchOffer(new FakeSiiau().fetcher(), {
      cycle: "202710",
      center: "D",
      subjectCode: "I5890",
    });

    expect(page).toEqual({ totalRecords: 0, sections: [] });
  });

  it("lets tests change seats and inject failures, also over HTTP", async () => {
    const fake = new FakeSiiau();
    await fake.handle(
      new Request("http://fake/__fake/available", {
        method: "POST",
        body: JSON.stringify({ cycle: "202620", center: "D", nrc: "78088", available: 2 }),
      }),
    );
    fake.failNext(503);

    await expect(
      fetchOffer(fake.fetcher(), { cycle: "202620", center: "D", subjectCode: "I5890" }),
    ).rejects.toThrow(/503/);
    const page = await fetchOffer(fake.fetcher(), {
      cycle: "202620",
      center: "D",
      subjectCode: "I5890",
    });
    expect(page.sections[0]?.available).toBe(2);
    expect(fake.requests).toHaveLength(2);
  });
});
