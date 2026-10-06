import { createDb, type Database } from "@haycupo/db";
import {
  createLogTransport,
  createResendTransport,
  createTelegramClient,
  type EmailTransport,
  type TelegramClient,
  type VapidConfig,
} from "@haycupo/notify";
import { createFileTransport } from "@haycupo/notify/file-transport";
import { buildUserAgent, createHttpFetcher, type SiiauFetcher } from "@haycupo/siiau";

import type { Config } from "./config";
import { SiiauGateway } from "./gateway";
import { createHandler, type Handler } from "./http";
import type { JobContext } from "./jobs";
import { APP_VERSION } from "./version";

/**
 * The HTTP fetcher pointed at SIIAU, or at a fake server when SIIAU_ORIGIN_OVERRIDE is set
 * (tests and local development). It does not pace requests: only the gateway calls it.
 */
export function createSiiauFetcher(config: Config, userAgent: string): SiiauFetcher {
  const fetcher = createHttpFetcher({ userAgent, timeoutMs: config.SIIAU_TIMEOUT_MS });
  const override = config.SIIAU_ORIGIN_OVERRIDE;
  if (!override) return fetcher;
  return (url) => fetcher(new URL(url.pathname + url.search, override));
}

/** Resend in production, JSON files in end-to-end tests, the console in development. */
export function createEmailTransport(config: Config): EmailTransport | null {
  switch (config.EMAIL_TRANSPORT) {
    case "resend":
      return config.RESEND_API_KEY
        ? createResendTransport({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM })
        : null;
    case "file":
      return config.EMAIL_FILE_DIR ? createFileTransport(config.EMAIL_FILE_DIR) : null;
    case "log":
      return createLogTransport();
  }
}

export function createTelegram(config: Config): TelegramClient | null {
  if (!config.TELEGRAM_BOT_TOKEN) return null;
  return createTelegramClient({
    token: config.TELEGRAM_BOT_TOKEN,
    apiOrigin: config.TELEGRAM_API_ORIGIN,
  });
}

/** Push services contact this address if our messages cause trouble. */
export function vapidFrom(config: Config): VapidConfig | null {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return null;
  return {
    subject: config.VAPID_SUBJECT ?? `mailto:${config.SIIAU_CONTACT_EMAIL}`,
    publicKey: config.VAPID_PUBLIC_KEY,
    privateKey: config.VAPID_PRIVATE_KEY,
  };
}

export interface Engine {
  context: JobContext;
  /** /health, /internal/* and /telegram/webhook (the site mounts them under /api). */
  handle: Handler;
}

/** Wires configuration, database, gateway and channels together. */
export function createEngine(
  config: Config,
  options: {
    db?: Database;
    email?: EmailTransport | null;
    telegram?: TelegramClient | null;
    /** Where the site mounts the engine's routes (`/api`). */
    basePath?: string;
  } = {},
): Engine {
  const db =
    options.db ??
    createDb({ url: config.TURSO_DATABASE_URL, authToken: config.TURSO_AUTH_TOKEN }).db;
  const userAgent = buildUserAgent({
    version: APP_VERSION,
    contactEmail: config.SIIAU_CONTACT_EMAIL,
  });
  const gateway = new SiiauGateway({
    db,
    fetcher: createSiiauFetcher(config, userAgent),
    userAgent,
    enabled: config.SIIAU_ENABLED,
    minDelayMs: config.SIIAU_MIN_DELAY_MS,
    maxWaitMs: config.SIIAU_MAX_WAIT_MS,
    // A holder that dies mid-request (a serverless function hitting its time limit) frees the
    // turn shortly after its request would have timed out anyway.
    leaseMs: config.SIIAU_TIMEOUT_MS + 10_000,
  });
  const context: JobContext = {
    db,
    gateway,
    config,
    email: options.email === undefined ? createEmailTransport(config) : options.email,
    telegram: options.telegram === undefined ? createTelegram(config) : options.telegram,
    vapid: vapidFrom(config),
  };
  return { context, handle: createHandler(context, { basePath: options.basePath }) };
}
