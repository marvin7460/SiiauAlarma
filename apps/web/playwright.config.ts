import { defineConfig, devices } from "@playwright/test";

import { E2E, SERVER_ENV, WEB_URL, WORKER_URL } from "./e2e/env";

const env = { ...process.env, ...SERVER_ENV } as Record<string, string>;

/**
 * End-to-end: the real web app (production build), the real worker (as a Node server) and a
 * fake SIIAU whose seats the tests change. Emails are written to files the tests read.
 *
 *   pnpm --filter @haycupo/web test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Use a preinstalled Chromium when the environment provides one (e.g. cloud sandboxes).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: [
    {
      command: "pnpm --filter @haycupo/fake-siiau start",
      url: `http://127.0.0.1:${String(E2E.fakeSiiauPort)}/robots.txt`,
      env,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @haycupo/worker start",
      url: `${WORKER_URL}/health`,
      env,
      reuseExistingServer: false,
    },
    {
      command: "pnpm build && pnpm exec next start --port 3100",
      url: WEB_URL,
      env,
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
