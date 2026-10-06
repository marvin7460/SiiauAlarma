import "server-only";

import { z } from "zod";

const ServerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /** Where apps/worker answers, e.g. https://haycupo-worker.<you>.workers.dev */
  WORKER_URL: z.url(),
  INTERNAL_API_TOKEN: z.string().min(32),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

/** Server-only settings, validated on first use so a missing variable fails loudly. */
export function serverEnv(): ServerEnv {
  cached ??= ServerEnvSchema.parse(process.env);
  return cached;
}
