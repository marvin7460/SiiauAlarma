import { offerSnapshots, subjects } from "@haycupo/db";
import { describe, expect, it } from "vitest";

import { useHarness } from "../test/harness";
import { ApiError } from "./errors";
import { searchOffer, type SearchInput } from "./search";

const I5890: SearchInput = { cycle: "202620", center: "D", kind: "code", value: "i5890" };
const pageRequests = (paths: { path: string }[]) =>
  paths.filter((request) => request.path.includes("consulta_oferta"));

describe("searchOffer", () => {
  const h = useHarness();
  let clock = new Date("2026-10-06T12:00:00Z");
  const deps = () => ({ db: h.db, gateway: h.gateway, cacheTtlMs: 300_000, now: () => clock });

  it("asks SIIAU, normalizes the query and returns live data", async () => {
    const result = await searchOffer(deps(), I5890);

    expect(result.freshness).toBe("live");
    expect(result.query).toEqual({ cycle: "202620", center: "D", kind: "code", value: "I5890" });
    expect(result.sections.map((section) => section.nrc)).toEqual(["78088", "78090", "78091"]);
    expect(result.fetchedAt).toBe(clock.toISOString());
  });

  it("reuses a recent result: a hundred searches, one request to SIIAU", async () => {
    await searchOffer(deps(), I5890);
    for (let index = 0; index < 100; index += 1) {
      const result = await searchOffer(deps(), I5890);
      expect(result.freshness).toBe("cached");
    }

    expect(pageRequests(h.fake.requests)).toHaveLength(1);
  });

  it("asks again once the cached result is older than the TTL", async () => {
    await searchOffer(deps(), I5890);
    clock = new Date(clock.getTime() + 301_000);

    const result = await searchOffer(deps(), I5890);

    expect(result.freshness).toBe("live");
    expect(pageRequests(h.fake.requests)).toHaveLength(2);
  });

  it("returns stale data with a warning when SIIAU fails", async () => {
    await searchOffer(deps(), I5890);
    clock = new Date(clock.getTime() + 301_000);
    h.fake.failNext(503);

    const result = await searchOffer(deps(), I5890);

    expect(result.freshness).toBe("stale");
    expect(result.warning?.kind).toBe("siiau_unavailable");
    expect(result.sections).toHaveLength(3);
    const [snapshot] = await h.db.select().from(offerSnapshots);
    expect(snapshot?.lastError).toMatch(/siiau_unavailable/);
  });

  it("fails clearly when SIIAU is down and nothing is cached", async () => {
    h.fake.failNext(503);

    await expect(searchOffer(deps(), I5890)).rejects.toMatchObject({
      kind: "siiau_unavailable",
    });
  });

  it("reports a changed page as siiau_changed, never as an empty result", async () => {
    h.fake.offers.set("202620|D", []);
    h.fake.handle = () => Promise.resolve(new Response("<html><body>Nuevo diseño</body></html>"));

    await expect(searchOffer(deps(), I5890)).rejects.toMatchObject({ kind: "siiau_changed" });
  });

  it("rejects invalid input before touching SIIAU", async () => {
    const error = await searchOffer(deps(), { ...I5890, value: "I5890&cup=X" }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "invalid_query", status: 400 });
    expect(h.fake.requests).toHaveLength(0);
  });

  it("searches by name and remembers subjects for autocomplete", async () => {
    const result = await searchOffer(deps(), { ...I5890, kind: "name", value: "diseño de" });

    expect(result.query.value).toBe("DISEÑO DE");
    expect(result.sections.map((section) => section.subjectCode)).toEqual(["I7024"]);
    expect(await h.db.select({ code: subjects.code, name: subjects.name }).from(subjects)).toEqual([
      { code: "I7024", name: "DISEÑO DE INTERFACES" },
    ]);
  });

  it("returns an empty, valid result for an unpublished offer", async () => {
    const result = await searchOffer(deps(), { ...I5890, cycle: "202710" });

    expect(result).toMatchObject({ freshness: "live", totalRecords: 0, sections: [] });
  });
});
