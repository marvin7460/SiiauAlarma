import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { alerts, users, watchedSubjects } from "@haycupo/db";
import { createTestDb, resetTestDb } from "@haycupo/db/testing";
import { FakeSiiau } from "@haycupo/fake-siiau";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseConfig } from "../src/config";
import { isServerless, runScheduledRun } from "../src/serverless";

/** The fake SIIAU over real HTTP, like the scheduled function will reach SIIAU. */
async function serve(fake: FakeSiiau): Promise<{ server: Server; origin: string }> {
  const server = createServer((message, reply) => {
    fake
      .handle(new Request(`http://fake${message.url ?? "/"}`))
      .then(async (response) => {
        reply.writeHead(response.status, Object.fromEntries(response.headers));
        reply.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch(() => {
        reply.writeHead(500).end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${String(port)}` };
}

describe("runScheduledRun (Netlify's scheduled function)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let fake: FakeSiiau;
  let http: { server: Server; origin: string };

  beforeAll(async () => {
    db = await createTestDb();
    fake = new FakeSiiau();
    http = await serve(fake);
  });
  afterAll(async () => {
    http.server.close();
    await db.close();
  });
  beforeEach(async () => {
    await resetTestDb(db.db);
    fake.reset();
  });

  const env = (overrides: Record<string, string> = {}) => ({
    TURSO_DATABASE_URL: db.url,
    INTERNAL_API_TOKEN: "t".repeat(40),
    APP_SECRET: "s".repeat(40),
    SIIAU_CONTACT_EMAIL: "dev@example.com",
    SIIAU_ORIGIN_OVERRIDE: http.origin,
    SIIAU_MIN_DELAY_MS: "2000",
    POLL_MAX_SUBJECTS_PER_RUN: "1",
    EMAIL_TRANSPORT: "log",
    ...overrides,
  });

  async function watch(subjectCode: string) {
    const [user] = await db.db
      .insert(users)
      .values({ email: `${subjectCode}@example.com` })
      .returning();
    const [subject] = await db.db
      .insert(watchedSubjects)
      .values({ cycle: "202620", center: "D", subjectCode, nextPollAt: new Date(0) })
      .returning();
    if (!user || !subject) throw new Error("setup failed");
    await db.db.insert(alerts).values({
      userId: user.id,
      watchedSubjectId: subject.id,
      kind: "subject",
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    });
  }

  it("polls one subject per run, so it never waits the pause between requests", async () => {
    await watch("I5890");
    await watch("I5898");

    const started = Date.now();
    const result = await runScheduledRun(env(), { budgetMs: 20_000 });

    expect(result).toMatchObject({ status: "ran", outcomes: [{ status: "polled" }] });
    const pages = fake.requests.filter((request) => request.path.includes("consulta_oferta"));
    expect(pages).toHaveLength(1);
    // robots.txt, then one page: one 2 s pause, not two.
    expect(Date.now() - started).toBeLessThan(4_000);

    const next = await runScheduledRun(env(), { budgetMs: 20_000 });
    expect(next).toMatchObject({ status: "ran", outcomes: [{ status: "polled" }] });
  });

  it("does nothing when another server polls (SCHEDULER_ENABLED=false)", async () => {
    await watch("I5890");

    const result = await runScheduledRun(env({ SCHEDULER_ENABLED: "false" }), {
      budgetMs: 20_000,
    });

    expect(result.status).toBe("skipped");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("isServerless", () => {
  it("recognizes Netlify and AWS Lambda", () => {
    expect(isServerless({ NETLIFY: "true" })).toBe(true);
    expect(isServerless({ AWS_LAMBDA_FUNCTION_NAME: "___netlify-server-handler" })).toBe(true);
    expect(isServerless({})).toBe(false);
  });
});

describe("configuration on a serverless platform", () => {
  const base = {
    TURSO_DATABASE_URL: "file:unused.db",
    INTERNAL_API_TOKEN: "t".repeat(40),
    APP_SECRET: "s".repeat(40),
    SIIAU_CONTACT_EMAIL: "dev@example.com",
  };

  it("waits less for SIIAU and polls one subject per run on Netlify", () => {
    expect(parseConfig({ ...base, NETLIFY: "true" })).toMatchObject({
      SIIAU_MAX_WAIT_MS: 2500,
      SIIAU_TIMEOUT_MS: 5500,
      POLL_MAX_SUBJECTS_PER_RUN: 1,
    });
    expect(parseConfig(base)).toMatchObject({
      SIIAU_MAX_WAIT_MS: 20_000,
      SIIAU_TIMEOUT_MS: 20_000,
      POLL_MAX_SUBJECTS_PER_RUN: 15,
    });
  });

  it("uses Netlify's site URL for links when APP_URL is not set", () => {
    const site = { ...base, NETLIFY: "true", URL: "https://haycupo.netlify.app" };
    expect(parseConfig(site).APP_URL).toBe("https://haycupo.netlify.app");
    expect(parseConfig({ ...site, APP_URL: "https://haycupo.mx" }).APP_URL).toBe(
      "https://haycupo.mx",
    );
  });

  it("keeps values set explicitly, and treats empty ones as unset", () => {
    expect(
      parseConfig({ ...base, NETLIFY: "true", SIIAU_TIMEOUT_MS: "8000", SIIAU_MAX_WAIT_MS: "" }),
    ).toMatchObject({ SIIAU_MAX_WAIT_MS: 2500, SIIAU_TIMEOUT_MS: 8000 });
  });
});
