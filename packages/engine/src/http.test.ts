import { siiauGateway } from "@haycupo/db";
import { describe, expect, it } from "vitest";

import { TEST_TOKEN, testConfig, useHarness } from "../test/harness";
import { HealthResponseSchema, OptionsResponseSchema } from "./contract";
import { createHandler, safeEqual } from "./http";
import { getSearchOptions } from "./options";

describe("HTTP handler", () => {
  const h = useHarness();
  const handler = () =>
    createHandler(
      {
        db: h.db,
        gateway: h.gateway,
        config: testConfig(),
        email: null,
        telegram: null,
        vapid: null,
      },
      { basePath: "/api" },
    );
  const call = (method: string, path: string, token: string | null = TEST_TOKEN, body?: unknown) =>
    handler()(
      new Request(`http://site${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  it("answers /api/health without a token", async () => {
    const response = await call("GET", "/api/health", null);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(HealthResponseSchema.parse(await response.json())).toEqual({
      ok: true,
      version: expect.any(String) as string,
      siiauEnabled: true,
      scheduler: true,
      channels: { email: false, telegram: false, push: false },
    });
  });

  it.each([null, "wrong-token"])("rejects internal routes with token %j", async (token) => {
    const response = await call("POST", "/api/internal/poll", token);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { kind: "unauthorized" } });
    expect(h.fake.requests).toHaveLength(0);
  });

  it("pulls and releases the emergency brake", async () => {
    const pause = await call("POST", "/api/internal/brake", TEST_TOKEN, {
      action: "pause",
      minutes: 30,
      reason: "prueba",
    });
    expect(pause.status).toBe(200);
    const [paused] = await h.db.select().from(siiauGateway);
    expect(paused?.pauseReason).toBe("pausa manual: prueba");
    expect(paused?.pausedUntil?.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);

    await call("POST", "/api/internal/brake", TEST_TOKEN, { action: "resume" });
    const [resumed] = await h.db.select().from(siiauGateway);
    expect(resumed?.pausedUntil).toBeNull();
  });

  it("refuses a malformed brake request", async () => {
    const response = await call("POST", "/api/internal/brake", TEST_TOKEN, { action: "stop" });

    expect(response.status).toBe(400);
  });

  it("runs a poll cycle on demand", async () => {
    const response = await call("POST", "/api/internal/poll");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expired: 0, outcomes: [] });
  });

  it("returns 404 for unknown routes and methods", async () => {
    expect((await call("GET", "/api/nope")).status).toBe(404);
    expect((await call("POST", "/api/health")).status).toBe(404);
  });
});

describe("getSearchOptions", () => {
  const h = useHarness();

  it("serves cycles and campuses, refreshing them at most once a day", async () => {
    const first = OptionsResponseSchema.parse(
      await getSearchOptions({ db: h.db, gateway: h.gateway }),
    );
    await getSearchOptions({ db: h.db, gateway: h.gateway });

    expect(first.cycles[0]).toEqual({ code: "202710", label: "Calendario 27 A" });
    expect(first.centers.map((center) => center.code)).toEqual(["D", "C"]);
    expect(h.fake.requests.filter((r) => r.path.includes("forma_consulta"))).toHaveLength(1);
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
