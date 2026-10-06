import "server-only";

import type { Config } from "@haycupo/engine";
import { z } from "zod";

import { getConfig } from "./engine";

/** Server-only settings (the engine's configuration), validated on first use. */
export function serverEnv(): Config {
  return getConfig();
}

/**
 * The public contact address, for the privacy and about pages. Read on its own so those pages
 * do not need the rest of the server settings.
 */
export function publicContactEmail(): string | null {
  const parsed = z.email().safeParse(process.env.SIIAU_CONTACT_EMAIL);
  return parsed.success ? parsed.data : null;
}
