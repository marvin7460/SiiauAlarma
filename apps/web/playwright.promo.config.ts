import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * Captures the real screens shown in the promo video, at phone size, with the same servers as
 * the end-to-end tests (fake SIIAU, fake Telegram Bot API). See scripts/promo/README.md.
 *
 *   pnpm --filter @haycupo/web promo:screens
 */
export default defineConfig({
  ...base,
  testDir: "./scripts/promo",
  testMatch: "screens.spec.ts",
  timeout: 180_000,
  reporter: "list",
});
