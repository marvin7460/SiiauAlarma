import type { DbHandle } from "@haycupo/db";
import { createTestDb, resetTestDb } from "@haycupo/db/testing";
import { FakeSiiau } from "@haycupo/fake-siiau";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { parseConfig, type Config } from "../src/config";
import { SiiauGateway } from "../src/gateway";

export const TEST_TOKEN = "t".repeat(40);

export function testConfig(overrides: Record<string, string> = {}): Config {
  return parseConfig({
    DATABASE_URL: "postgres://unused",
    INTERNAL_API_TOKEN: TEST_TOKEN,
    SIIAU_CONTACT_EMAIL: "dev@example.com",
    APP_SECRET: "s".repeat(40),
    ...overrides,
  });
}

/**
 * One PGlite database per test file (reset before each test) and a fresh fake SIIAU per
 * test, wired through a real gateway with a short pause between requests.
 */
export function useHarness() {
  const state = {} as { handle: DbHandle; fake: FakeSiiau; gateway: SiiauGateway };

  beforeAll(async () => {
    state.handle = await createTestDb();
  });
  afterAll(async () => {
    await state.handle.close();
  });
  beforeEach(async () => {
    await resetTestDb(state.handle.db);
    state.fake = new FakeSiiau();
    state.gateway = new SiiauGateway({
      db: state.handle.db,
      fetcher: state.fake.fetcher(),
      userAgent: "HayCupo/test (+https://example.com; dev@example.com)",
      enabled: true,
      minDelayMs: 20,
      maxWaitMs: 5000,
    });
  });

  return {
    get db() {
      return state.handle.db;
    },
    get fake() {
      return state.fake;
    },
    get gateway() {
      return state.gateway;
    },
  };
}
