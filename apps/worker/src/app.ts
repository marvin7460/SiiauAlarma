import type { Database } from "@haycupo/db";
import { createLogTransport, createResendTransport, type EmailTransport } from "@haycupo/notify";
import { buildUserAgent, createHttpFetcher, type SiiauFetcher } from "@haycupo/siiau";

import type { Config } from "./config";
import { SiiauGateway } from "./gateway";
import { createHandler, type Handler } from "./http";
import type { JobContext } from "./jobs";

export const WORKER_VERSION = "0.1.0";

/**
 * The HTTP fetcher pointed at SIIAU, or at a fake server when SIIAU_ORIGIN_OVERRIDE is set
 * (tests and local development). It does not pace requests: only the gateway calls it.
 */
export function createSiiauFetcher(config: Config, userAgent: string): SiiauFetcher {
  const fetcher = createHttpFetcher({ userAgent, timeoutMs: 20_000 });
  const override = config.SIIAU_ORIGIN_OVERRIDE;
  if (!override) return fetcher;
  return (url) => fetcher(new URL(url.pathname + url.search, override));
}

/**
 * Email transport for runtimes without a file system (Cloudflare). The Node entry point can
 * pass its own (e.g. the file transport for end-to-end tests).
 */
export function createEmailTransport(config: Config): EmailTransport | null {
  switch (config.EMAIL_TRANSPORT) {
    case "resend":
      return config.RESEND_API_KEY
        ? createResendTransport({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM })
        : null;
    case "log":
      return createLogTransport();
    case "file":
      return null;
  }
}

export interface App {
  context: JobContext;
  handle: Handler;
}

/** Wires configuration, database, gateway and channels together. Same for every runtime. */
export function createApp(
  config: Config,
  db: Database,
  options: { email?: EmailTransport | null } = {},
): App {
  const userAgent = buildUserAgent({
    version: WORKER_VERSION,
    contactEmail: config.SIIAU_CONTACT_EMAIL,
  });
  const gateway = new SiiauGateway({
    db,
    fetcher: createSiiauFetcher(config, userAgent),
    userAgent,
    enabled: config.SIIAU_ENABLED,
    minDelayMs: config.SIIAU_MIN_DELAY_MS,
    maxWaitMs: config.SIIAU_MAX_WAIT_MS,
  });
  const context: JobContext = {
    db,
    gateway,
    config,
    email: options.email === undefined ? createEmailTransport(config) : options.email,
  };
  return { context, handle: createHandler(context) };
}
