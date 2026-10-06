import path from "node:path";

/**
 * Everything the end-to-end run needs, in one place. Ports differ from local development so a
 * dev session can stay open. The database is a SQLite file next to this one, emptied (not
 * deleted: the server may already have it open) before the run.
 */
export const E2E = {
  databaseFile: path.join(import.meta.dirname, ".e2e.db"),
  webPort: 3100,
  fakeSiiauPort: 8798,
  token: "e2e-internal-token-0123456789abcdef0123456789",
  secret: "e2e-app-secret-0123456789abcdef0123456789abcd",
  emailDir: path.join(import.meta.dirname, ".emails"),
  telegramBot: "HayCupoPruebaBot",
  telegramSecret: "e2e-webhook-secret-0123456789",
};

export const DATABASE_URL = `file:${E2E.databaseFile}`;
export const WEB_URL = `http://127.0.0.1:${String(E2E.webPort)}`;
export const FAKE_SIIAU_URL = `http://127.0.0.1:${String(E2E.fakeSiiauPort)}`;

/** Environment of the Next.js server (and the fake SIIAU) during the run. */
export const SERVER_ENV: Record<string, string> = {
  TURSO_DATABASE_URL: DATABASE_URL,
  INTERNAL_API_TOKEN: E2E.token,
  APP_SECRET: E2E.secret,
  APP_URL: WEB_URL,
  // Tests decide when to poll (POST /api/internal/poll), so the every-minute scheduler is off.
  SCHEDULER_ENABLED: "false",
  SIIAU_CONTACT_EMAIL: "e2e@example.com",
  SIIAU_ORIGIN_OVERRIDE: FAKE_SIIAU_URL,
  SIIAU_MIN_DELAY_MS: "2000",
  EMAIL_TRANSPORT: "file",
  EMAIL_FILE_DIR: E2E.emailDir,
  FAKE_SIIAU_PORT: String(E2E.fakeSiiauPort),
  // Telegram: the fake server also plays the Bot API; tests deliver updates to the webhook.
  TELEGRAM_BOT_USERNAME: E2E.telegramBot,
  TELEGRAM_BOT_TOKEN: "123456:e2e-fake-token",
  TELEGRAM_WEBHOOK_SECRET: E2E.telegramSecret,
  TELEGRAM_API_ORIGIN: FAKE_SIIAU_URL,
  NEXT_TELEMETRY_DISABLED: "1",
};
