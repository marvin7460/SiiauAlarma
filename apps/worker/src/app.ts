import type { Database } from "@haycupo/db";
import { buildUserAgent, createHttpFetcher, type SiiauFetcher } from "@haycupo/siiau";

import type { Config } from "./config";
import { SiiauGateway } from "./gateway";
import { createHandler, type Handler } from "./http";

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

export interface App {
  gateway: SiiauGateway;
  handle: Handler;
}

/** Wires configuration, database and gateway together. Same for every runtime. */
export function createApp(config: Config, db: Database): App {
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
  return { gateway, handle: createHandler({ db, gateway, config }) };
}
