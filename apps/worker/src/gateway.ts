import { siiauGateway, siiauRequests, type Database } from "@haycupo/db";
import {
  SIIAU_BASE_URLS,
  SiiauHttpError,
  SiiauParseError,
  SiiauIncompleteResultsError,
  buildRobotsTxtUrl,
  decodeSiiauBody,
  robotsPolicyFromResponse,
  unreachableRobotsPolicy,
  type RobotsPolicy,
  type SiiauFetcher,
  type SiiauResponse,
} from "@haycupo/siiau";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

export type RequestPurpose = "search" | "poll" | "options" | "robots";

/** SIIAU is paused: kill switch, emergency brake or circuit breaker. */
export class GatewayPausedError extends Error {
  override name = "GatewayPausedError";

  constructor(
    readonly reason: string,
    readonly until: Date | null,
  ) {
    super(`Requests to SIIAU are paused: ${reason}`);
  }
}

/** Waited `maxWaitMs` and it was never our turn. */
export class GatewayBusyError extends Error {
  override name = "GatewayBusyError";
}

/** robots.txt forbids the request, or could not be read. */
export class GatewayBlockedError extends Error {
  override name = "GatewayBlockedError";
}

/** Network failure or timeout talking to SIIAU. */
export class SiiauNetworkError extends Error {
  override name = "SiiauNetworkError";
}

export interface GatewayOptions {
  db: Database;
  /** Plain HTTP fetcher (no pacing). The gateway decides when it may be called. */
  fetcher: SiiauFetcher;
  userAgent: string;
  enabled: boolean;
  /** Pause between the end of one request and the start of the next. */
  minDelayMs: number;
  /** How long a caller waits for its turn. */
  maxWaitMs: number;
  /** A crashed holder loses its turn after this long. */
  leaseMs?: number;
  /** Failures in a row that trip the circuit breaker. */
  failureThreshold?: number;
  /** First pause when the breaker trips; doubles on each trip in a row, up to `maxPauseMs`. */
  basePauseMs?: number;
  maxPauseMs?: number;
  robotsMaxAgeMs?: number;
  /** How soon to retry robots.txt after failing to read it. */
  robotsRetryMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const msInterval = (ms: number) => sql`(${ms}::integer * interval '1 millisecond')`;

/**
 * The only way to reach SIIAU. Every process (searches from the web, the poller, on Cloudflare
 * or on a VM) takes turns through one row in Postgres:
 *
 * - a lease, so a single request is in flight at a time;
 * - the end time of the last request, so there is always `minDelayMs` between requests
 *   (measured with the database clock, so machines with different clocks agree);
 * - a circuit breaker that pauses everything after `failureThreshold` failures in a row;
 * - the cached robots.txt, checked before every request.
 */
export class SiiauGateway {
  private readonly leaseMs: number;
  private readonly failureThreshold: number;
  private readonly basePauseMs: number;
  private readonly maxPauseMs: number;
  private readonly robotsMaxAgeMs: number;
  private readonly robotsRetryMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private robots: { policy: RobotsPolicy; checkedAt: number } | undefined;

  constructor(private readonly options: GatewayOptions) {
    this.leaseMs = options.leaseMs ?? 60_000;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.basePauseMs = options.basePauseMs ?? 15 * 60_000;
    this.maxPauseMs = options.maxPauseMs ?? 6 * 60 * 60_000;
    this.robotsMaxAgeMs = options.robotsMaxAgeMs ?? 24 * 60 * 60_000;
    this.robotsRetryMs = options.robotsRetryMs ?? 15 * 60_000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Waits for its turn, requests `url`, gives the turn back, then hands the response to
   * `parse`. The outcome (including parse errors) is recorded for the status page.
   */
  async request<T>(
    purpose: RequestPurpose,
    url: URL,
    parse: (response: SiiauResponse) => T,
  ): Promise<T> {
    if (!this.options.enabled) throw new GatewayPausedError("disabled by SIIAU_ENABLED", null);
    if (url.origin !== new URL(SIIAU_BASE_URLS.current).origin) {
      throw new GatewayBlockedError(`Only ${SIIAU_BASE_URLS.current} goes through the gateway`);
    }
    const policy = await this.robotsPolicy();
    if (!policy.isAllowed(url)) {
      throw new GatewayBlockedError("robots.txt does not allow this request (or is unreadable)");
    }

    const { response, startedAt, durationMs } = await this.takeTurn(
      purpose,
      url,
      policy.crawlDelayMs,
    );
    try {
      const result = parse(response);
      await this.log(purpose, url, startedAt, durationMs, response.status, "ok");
      return result;
    } catch (error) {
      const parseFailed =
        error instanceof SiiauParseError || error instanceof SiiauIncompleteResultsError;
      await this.log(
        purpose,
        url,
        startedAt,
        durationMs,
        response.status,
        parseFailed ? "parse_error" : "ok",
      );
      throw error;
    }
  }

  /** A fetcher for packages/siiau that goes through the gateway (records outcome as "ok"). */
  fetcherFor(purpose: RequestPurpose): SiiauFetcher {
    return (url) => this.request(purpose, url, (response) => response);
  }

  private async takeTurn(
    purpose: RequestPurpose,
    url: URL,
    crawlDelayMs: number | undefined,
  ): Promise<{ response: SiiauResponse; startedAt: Date; durationMs: number }> {
    const owner = crypto.randomUUID();
    await this.acquire(owner, Math.max(this.options.minDelayMs, crawlDelayMs ?? 0));
    const startedAt = new Date();
    let success = false;
    try {
      let response: SiiauResponse;
      try {
        response = await this.options.fetcher(url);
      } catch (error) {
        const durationMs = Date.now() - startedAt.getTime();
        await this.log(purpose, url, startedAt, durationMs, null, "network_error");
        throw new SiiauNetworkError(error instanceof Error ? error.message : String(error));
      }
      const durationMs = Date.now() - startedAt.getTime();
      if (response.status < 200 || response.status >= 300) {
        await this.log(purpose, url, startedAt, durationMs, response.status, "http_error");
        throw new SiiauHttpError(response.status, url.href);
      }
      success = true;
      return { response, startedAt, durationMs };
    } finally {
      await this.release(owner, success);
    }
  }

  private async acquire(owner: string, gapMs: number): Promise<void> {
    const deadline = Date.now() + this.options.maxWaitMs;
    for (;;) {
      const acquired = await this.options.db
        .update(siiauGateway)
        .set({ leaseOwner: owner, leaseExpiresAt: sql`now() + ${msInterval(this.leaseMs)}` })
        .where(
          and(
            eq(siiauGateway.id, 1),
            or(isNull(siiauGateway.leaseExpiresAt), lte(siiauGateway.leaseExpiresAt, sql`now()`)),
            or(
              isNull(siiauGateway.lastRequestFinishedAt),
              lte(siiauGateway.lastRequestFinishedAt, sql`now() - ${msInterval(gapMs)}`),
            ),
            or(isNull(siiauGateway.pausedUntil), lte(siiauGateway.pausedUntil, sql`now()`)),
          ),
        )
        .returning({ id: siiauGateway.id });
      if (acquired.length > 0) return;

      const [state] = await this.options.db
        .select({
          pausedUntil: siiauGateway.pausedUntil,
          pauseReason: siiauGateway.pauseReason,
          waitMs: sql<number>`greatest(
            coalesce(extract(epoch from (${siiauGateway.leaseExpiresAt} - now())) * 1000, 0),
            coalesce(extract(epoch from (${siiauGateway.lastRequestFinishedAt} + ${msInterval(gapMs)} - now())) * 1000, 0)
          )::float8`.mapWith(Number),
          paused: sql<boolean>`coalesce(${siiauGateway.pausedUntil} > now(), false)`,
        })
        .from(siiauGateway)
        .where(eq(siiauGateway.id, 1));
      if (!state) throw new Error("siiau_gateway row is missing: run the migrations");
      if (state.paused) {
        throw new GatewayPausedError(state.pauseReason ?? "paused", state.pausedUntil);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new GatewayBusyError("Timed out waiting for a turn to call SIIAU");
      // The lease may be released before it expires, so do not sleep longer than a second.
      await this.sleep(Math.max(25, Math.min(state.waitMs, 1000, remaining)));
    }
  }

  private async release(owner: string, success: boolean): Promise<void> {
    if (success) {
      await this.options.db
        .update(siiauGateway)
        .set({
          leaseOwner: null,
          leaseExpiresAt: null,
          lastRequestFinishedAt: sql`now()`,
          consecutiveFailures: 0,
          trips: 0,
        })
        .where(eq(siiauGateway.leaseOwner, owner));
      return;
    }
    // In SET, column names refer to the values before the update.
    const trips = sql`${siiauGateway.consecutiveFailures} + 1 >= ${this.failureThreshold}`;
    await this.options.db
      .update(siiauGateway)
      .set({
        leaseOwner: null,
        leaseExpiresAt: null,
        lastRequestFinishedAt: sql`now()`,
        consecutiveFailures: sql`case when ${trips} then 0 else ${siiauGateway.consecutiveFailures} + 1 end`,
        pausedUntil: sql`case when ${trips}
          then now() + least(${this.basePauseMs}::float8 * power(2, ${siiauGateway.trips}), ${this.maxPauseMs}::float8) * interval '1 millisecond'
          else ${siiauGateway.pausedUntil} end`,
        pauseReason: sql`case when ${trips}
          then ${`${String(this.failureThreshold)} errores seguidos al consultar SIIAU`}
          else ${siiauGateway.pauseReason} end`,
        trips: sql`case when ${trips} then ${siiauGateway.trips} + 1 else ${siiauGateway.trips} end`,
      })
      .where(eq(siiauGateway.leaseOwner, owner));
  }

  /** robots.txt, cached in memory and in the database; refreshed once a day. */
  private async robotsPolicy(): Promise<RobotsPolicy> {
    const now = Date.now();
    if (this.robots && now - this.robots.checkedAt < 60_000) return this.robots.policy;

    const robotsUrl = buildRobotsTxtUrl("current");
    const [stored] = await this.options.db
      .select({
        txt: siiauGateway.robotsTxt,
        status: siiauGateway.robotsStatus,
        fetchedAt: siiauGateway.robotsFetchedAt,
      })
      .from(siiauGateway)
      .where(eq(siiauGateway.id, 1));

    const age = stored?.fetchedAt ? now - stored.fetchedAt.getTime() : Infinity;
    const maxAge = stored?.status == null ? this.robotsRetryMs : this.robotsMaxAgeMs;
    let policy: RobotsPolicy;
    if (stored?.fetchedAt && age < maxAge) {
      policy =
        stored.status == null
          ? unreachableRobotsPolicy()
          : robotsPolicyFromResponse({
              robotsUrl,
              status: stored.status,
              body: stored.txt ?? "",
              userAgent: this.options.userAgent,
            });
    } else {
      policy = await this.refreshRobots(robotsUrl);
    }
    this.robots = { policy, checkedAt: now };
    return policy;
  }

  private async refreshRobots(robotsUrl: URL): Promise<RobotsPolicy> {
    let status: number | null = null;
    let body = "";
    const owner = crypto.randomUUID();
    await this.acquire(owner, this.options.minDelayMs);
    const startedAt = new Date();
    try {
      const response = await this.options.fetcher(robotsUrl);
      status = response.status;
      body = decodeSiiauBody(response.bytes, response.contentType).slice(0, 50_000);
    } catch {
      status = null;
    } finally {
      // A missing robots.txt is normal; only an unreachable one counts as a failure.
      await this.release(owner, status !== null && status < 500);
    }
    await this.options.db
      .update(siiauGateway)
      .set({ robotsTxt: body, robotsStatus: status, robotsFetchedAt: sql`now()` })
      .where(eq(siiauGateway.id, 1));
    await this.log(
      "robots",
      robotsUrl,
      startedAt,
      Date.now() - startedAt.getTime(),
      status,
      status === null ? "network_error" : status < 500 ? "ok" : "http_error",
    );
    return status === null
      ? unreachableRobotsPolicy()
      : robotsPolicyFromResponse({ robotsUrl, status, body, userAgent: this.options.userAgent });
  }

  private async log(
    purpose: RequestPurpose,
    url: URL,
    startedAt: Date,
    durationMs: number,
    status: number | null,
    outcome: "ok" | "http_error" | "network_error" | "parse_error",
  ): Promise<void> {
    await this.options.db.insert(siiauRequests).values({
      startedAt,
      durationMs,
      purpose,
      path: url.pathname + url.search,
      status,
      outcome,
    });
  }
}
