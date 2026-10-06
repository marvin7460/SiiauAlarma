import { siiauGateway, siiauRequests, type DbHandle } from "@haycupo/db";
import { createTestDb, resetTestDb } from "@haycupo/db/testing";
import { SiiauHttpError, SiiauParseError, type SiiauResponse } from "@haycupo/siiau";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GatewayBlockedError,
  GatewayBusyError,
  GatewayPausedError,
  SiiauGateway,
  SiiauNetworkError,
  type GatewayOptions,
} from "./gateway";

const PAGE = new URL("https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta?cup=D");
const USER_AGENT = "HayCupo/test (+https://example.com; dev@example.com)";

interface Call {
  url: string;
  startedAt: number;
  finishedAt: number;
}

/** A fake SIIAU that records when each request starts and ends. */
function fakeSiiau(
  options: {
    robots?: string | number | Error;
    page?: (call: number) => SiiauResponse | Error | string | number;
    latencyMs?: number;
  } = {},
) {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let pageCalls = 0;
  const fetcher = async (url: URL): Promise<SiiauResponse> => {
    const startedAt = Date.now();
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, options.latencyMs ?? 5));
    inFlight -= 1;
    calls.push({ url: url.pathname, startedAt, finishedAt: Date.now() });
    const robots = options.robots ?? "User-agent: *\nDisallow:\n";
    const answer = url.pathname === "/robots.txt" ? robots : (options.page?.(pageCalls++) ?? "ok");
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") {
      return { status: answer, contentType: "text/plain", bytes: new Uint8Array() };
    }
    if (typeof answer === "string") {
      return { status: 200, contentType: "text/plain", bytes: new TextEncoder().encode(answer) };
    }
    return answer;
  };
  return {
    fetcher,
    calls,
    pages: () => calls.filter((call) => call.url !== "/robots.txt"),
    maxInFlight: () => maxInFlight,
  };
}

describe("SiiauGateway", () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });
  afterAll(async () => {
    await handle.close();
  });
  beforeEach(async () => {
    await resetTestDb(handle.db);
  });

  const gateway = (siiau: ReturnType<typeof fakeSiiau>, overrides: Partial<GatewayOptions> = {}) =>
    new SiiauGateway({
      db: handle.db,
      fetcher: siiau.fetcher,
      userAgent: USER_AGENT,
      enabled: true,
      minDelayMs: 300,
      maxWaitMs: 5000,
      ...overrides,
    });

  const ok = (response: SiiauResponse) => response.status;

  it("reads robots.txt once, then requests the page", async () => {
    const siiau = fakeSiiau();
    const gw = gateway(siiau);

    await gw.request("search", PAGE, ok);
    await gw.request("search", PAGE, ok);

    expect(siiau.calls.map((call) => call.url)).toEqual([
      "/robots.txt",
      "/wal/sspseca.consulta_oferta",
      "/wal/sspseca.consulta_oferta",
    ]);
  });

  it("leaves at least minDelayMs between the end of a request and the next one", async () => {
    const siiau = fakeSiiau();
    const gw = gateway(siiau);

    await gw.request("search", PAGE, ok);
    await gw.request("search", PAGE, ok);

    for (let index = 1; index < siiau.calls.length; index += 1) {
      const previous = siiau.calls[index - 1];
      const current = siiau.calls[index];
      // Small tolerance: the database and the test measure time at slightly different moments.
      expect((current?.startedAt ?? 0) - (previous?.finishedAt ?? 0)).toBeGreaterThanOrEqual(290);
    }
  });

  it("never lets two processes call SIIAU at the same time", async () => {
    const siiau = fakeSiiau({ latencyMs: 50 });
    // Two gateways = two processes (e.g. the poller and a search) sharing the database.
    const first = gateway(siiau);
    const second = gateway(siiau);

    await Promise.all([
      first.request("poll", PAGE, ok),
      second.request("search", PAGE, ok),
      first.request("poll", PAGE, ok),
    ]);

    expect(siiau.pages()).toHaveLength(3);
    expect(siiau.maxInFlight()).toBe(1);
  });

  it("refuses requests that robots.txt disallows", async () => {
    const siiau = fakeSiiau({ robots: "User-agent: *\nDisallow: /wal/\n" });

    await expect(gateway(siiau).request("search", PAGE, ok)).rejects.toBeInstanceOf(
      GatewayBlockedError,
    );
    expect(siiau.pages()).toHaveLength(0);
  });

  it("refuses everything while robots.txt is unreachable", async () => {
    const siiau = fakeSiiau({ robots: new Error("ECONNRESET") });

    await expect(gateway(siiau).request("search", PAGE, ok)).rejects.toBeInstanceOf(
      GatewayBlockedError,
    );
    expect(siiau.pages()).toHaveLength(0);
  });

  it("trips the breaker after N failures in a row and stops calling SIIAU", async () => {
    const siiau = fakeSiiau({ page: () => 503 });
    const gw = gateway(siiau, { failureThreshold: 2, minDelayMs: 50 });

    await expect(gw.request("poll", PAGE, ok)).rejects.toBeInstanceOf(SiiauHttpError);
    await expect(gw.request("poll", PAGE, ok)).rejects.toBeInstanceOf(SiiauHttpError);
    await expect(gw.request("poll", PAGE, ok)).rejects.toBeInstanceOf(GatewayPausedError);

    expect(siiau.pages()).toHaveLength(2);
    const [state] = await handle.db.select().from(siiauGateway);
    expect(state?.pauseReason).toMatch(/2 errores seguidos/);
    expect(state?.trips).toBe(1);
  });

  it("resets the failure count after a success", async () => {
    const siiau = fakeSiiau({ page: (call) => (call === 0 ? 503 : "ok") });
    const gw = gateway(siiau, { failureThreshold: 2, minDelayMs: 50 });

    await expect(gw.request("poll", PAGE, ok)).rejects.toBeInstanceOf(SiiauHttpError);
    await gw.request("poll", PAGE, ok);

    const [state] = await handle.db.select().from(siiauGateway);
    expect(state?.consecutiveFailures).toBe(0);
    expect(state?.pausedUntil).toBeNull();
  });

  it("turns network errors into SiiauNetworkError", async () => {
    const siiau = fakeSiiau({ page: () => new TypeError("fetch failed") });

    await expect(gateway(siiau).request("search", PAGE, ok)).rejects.toBeInstanceOf(
      SiiauNetworkError,
    );
  });

  it("honors the kill switch without touching SIIAU", async () => {
    const siiau = fakeSiiau();

    await expect(
      gateway(siiau, { enabled: false }).request("search", PAGE, ok),
    ).rejects.toBeInstanceOf(GatewayPausedError);
    expect(siiau.calls).toHaveLength(0);
  });

  it("honors a manual pause (emergency brake)", async () => {
    await handle.db
      .update(siiauGateway)
      .set({ pausedUntil: sql`now() + interval '1 hour'`, pauseReason: "manual" })
      .where(eq(siiauGateway.id, 1));
    const siiau = fakeSiiau();

    await expect(gateway(siiau).request("search", PAGE, ok)).rejects.toThrow(/manual/);
    expect(siiau.pages()).toHaveLength(0);
  });

  it("gives up with GatewayBusyError when the turn does not come in time", async () => {
    const siiau = fakeSiiau();
    const gw = gateway(siiau, { maxWaitMs: 200, minDelayMs: 50 });
    await gw.request("search", PAGE, ok); // robots.txt is now cached
    await handle.db
      .update(siiauGateway)
      .set({ leaseOwner: "someone-else", leaseExpiresAt: sql`now() + interval '1 minute'` })
      .where(eq(siiauGateway.id, 1));

    await expect(gw.request("search", PAGE, ok)).rejects.toBeInstanceOf(GatewayBusyError);
  });

  it("takes over a lease whose holder crashed", async () => {
    await handle.db
      .update(siiauGateway)
      .set({ leaseOwner: "crashed", leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(siiauGateway.id, 1));
    const siiau = fakeSiiau();

    await expect(gateway(siiau).request("search", PAGE, ok)).resolves.toBe(200);
  });

  it("records each request and its outcome for the status page", async () => {
    const siiau = fakeSiiau({ page: (call) => (call < 2 ? "ok" : 500) });
    const gw = gateway(siiau, { minDelayMs: 50 });

    await gw.request("search", PAGE, ok);
    await expect(
      gw.request("poll", PAGE, () => {
        throw new SiiauParseError("changed");
      }),
    ).rejects.toThrow(SiiauParseError);
    await expect(gw.request("poll", PAGE, ok)).rejects.toThrow(SiiauHttpError);

    const log = await handle.db
      .select({
        purpose: siiauRequests.purpose,
        outcome: siiauRequests.outcome,
        status: siiauRequests.status,
      })
      .from(siiauRequests)
      .orderBy(siiauRequests.id);
    expect(log).toEqual([
      { purpose: "robots", outcome: "ok", status: 200 },
      { purpose: "search", outcome: "ok", status: 200 },
      { purpose: "poll", outcome: "parse_error", status: 200 },
      { purpose: "poll", outcome: "http_error", status: 500 },
    ]);
  });
});
