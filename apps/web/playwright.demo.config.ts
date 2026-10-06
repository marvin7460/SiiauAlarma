import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * Records docs/demo.gif: the same servers as the end-to-end tests (fake SIIAU, worker, web),
 * driven through the main flow.
 *
 *   pnpm --filter @haycupo/web demo:gif
 */
export default defineConfig({
  ...base,
  testDir: "./scripts/demo",
  testMatch: "record.spec.ts",
  timeout: 180_000,
  reporter: "list",
});
