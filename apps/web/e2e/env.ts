import path from "node:path";

/**
 * Everything the end-to-end run needs, in one place. Ports differ from local development so a
 * dev session can stay open. The database is a separate one (haycupo_e2e) that is wiped.
 */
export const E2E = {
  databaseUrl:
    process.env.E2E_DATABASE_URL ?? "postgres://haycupo:haycupo@127.0.0.1:5432/haycupo_e2e",
  webPort: 3100,
  workerPort: 8797,
  fakeSiiauPort: 8798,
  token: "e2e-internal-token-0123456789abcdef0123456789",
  secret: "e2e-app-secret-0123456789abcdef0123456789abcd",
  emailDir: path.join(import.meta.dirname, ".emails"),
  telegramBot: "HayCupoPruebaBot",
  telegramSecret: "e2e-webhook-secret-0123456789",
};

export const WEB_URL = `http://127.0.0.1:${String(E2E.webPort)}`;
export const WORKER_URL = `http://127.0.0.1:${String(E2E.workerPort)}`;
export const FAKE_SIIAU_URL = `http://127.0.0.1:${String(E2E.fakeSiiauPort)}`;

/** Environment shared by the worker and the web app during the run. */
export const SERVER_ENV: Record<string, string> = {
  DATABASE_URL: E2E.databaseUrl,
  INTERNAL_API_TOKEN: E2E.token,
  APP_SECRET: E2E.secret,
  APP_URL: WEB_URL,
  WORKER_URL,
  SIIAU_CONTACT_EMAIL: "e2e@example.com",
  SIIAU_ORIGIN_OVERRIDE: FAKE_SIIAU_URL,
  SIIAU_MIN_DELAY_MS: "2000",
  EMAIL_TRANSPORT: "file",
  EMAIL_FILE_DIR: E2E.emailDir,
  WORKER_PORT: String(E2E.workerPort),
  WORKER_CRON: "off",
  FAKE_SIIAU_PORT: String(E2E.fakeSiiauPort),
  // Telegram: the fake server also plays the Bot API; tests deliver updates to the webhook.
  TELEGRAM_BOT_USERNAME: E2E.telegramBot,
  TELEGRAM_BOT_TOKEN: "123456:e2e-fake-token",
  TELEGRAM_WEBHOOK_SECRET: E2E.telegramSecret,
  TELEGRAM_API_ORIGIN: FAKE_SIIAU_URL,
  NEXT_TELEMETRY_DISABLED: "1",
};
