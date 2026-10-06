import "server-only";

import { createLogTransport, type EmailTransport } from "@haycupo/notify";

import { getEngine } from "./engine";

/** Resend in production, JSON files in end-to-end tests, the console in development. */
export function emailTransport(): EmailTransport {
  return getEngine().context.email ?? createLogTransport();
}
