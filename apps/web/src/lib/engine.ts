import "server-only";

import { createEngine, parseConfig, type Config, type Engine } from "@haycupo/engine";

let config: Config | undefined;
let engine: Engine | undefined;

/** Settings from the environment, validated on first use so a missing variable fails loudly. */
export function getConfig(): Config {
  config ??= parseConfig(process.env);
  return config;
}

/**
 * The engine (database client, SIIAU gateway, channels) of this server.
 *
 * One per module instance, deliberately not on globalThis: Next.js bundles pages, route
 * handlers and instrumentation separately, each with its own copy of the engine's classes. An
 * engine created in one bundle and used from another would throw errors that fail the other
 * copy's `instanceof` checks (a SIIAU outage would show as an internal error). Several engines
 * are fine: they share the database, and the gateway takes turns through it.
 */
export function getEngine(): Engine {
  engine ??= createEngine(getConfig(), { basePath: "/api" });
  return engine;
}
