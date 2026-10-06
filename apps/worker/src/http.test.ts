import { describe, expect, it } from "vitest";

import { TEST_TOKEN, testConfig, useHarness } from "../test/harness";
import { OptionsResponseSchema, SearchResponseSchema } from "./contract";
import { SiiauGateway } from "./gateway";
import { createHandler, safeEqual } from "./http";

describe("HTTP handler", () => {
  const h = useHarness();
  const handler = () => createHandler({ db: h.db, gateway: h.gateway, config: testConfig() });
  const get = (path: string, token: string | null = TEST_TOKEN) =>
    handler()(
      new Request(`http://worker${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    );

  it("answers /health without a token", async () => {
    const response = await get("/health", null);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each([null, "wrong-token"])("rejects internal routes with token %j", async (token) => {
    const response = await get("/internal/search?cycle=202620&center=D&code=I5890", token);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { kind: "unauthorized" } });
    expect(h.fake.requests).toHaveLength(0);
  });

  it("searches and returns data matching the contract", async () => {
    const response = await get("/internal/search?cycle=202620&center=D&code=I5890");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = SearchResponseSchema.parse(await response.json());
    expect(body.sections).toHaveLength(3);
  });

  it("returns 400 for a malformed query", async () => {
    const response = await get("/internal/search?cycle=202620&center=D");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { kind: "invalid_query" } });
  });

  it("returns 503 with kind paused when the kill switch is on", async () => {
    const disabled = new SiiauGateway({
      db: h.db,
      fetcher: h.fake.fetcher(),
      userAgent: "test",
      enabled: false,
      minDelayMs: 20,
      maxWaitMs: 100,
    });
    const response = await createHandler({ db: h.db, gateway: disabled, config: testConfig() })(
      new Request("http://worker/internal/search?cycle=202620&center=D&code=I5890", {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { kind: "paused" } });
    expect(h.fake.requests).toHaveLength(0);
  });

  it("serves cycles and campuses, refreshing them at most once a day", async () => {
    const first = OptionsResponseSchema.parse(await (await get("/internal/options")).json());
    await get("/internal/options");

    expect(first.cycles[0]).toEqual({ code: "202710", label: "Calendario 27 A" });
    expect(first.centers.map((center) => center.code)).toEqual(["D", "C"]);
    expect(h.fake.requests.filter((r) => r.path.includes("forma_consulta"))).toHaveLength(1);
  });

  it("returns 404 for unknown routes and methods", async () => {
    expect((await get("/nope")).status).toBe(404);
    const post = await handler()(new Request("http://worker/health", { method: "POST" }));
    expect(post.status).toBe(404);
  });
});

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
