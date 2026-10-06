import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

/**
 * Settings read from the environment (Cloudflare vars/secrets or process.env). Every limit that
 * protects SIIAU has a safe default and a floor that cannot be configured away.
 */
export const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Shared secret between apps/web and this worker. At least 32 characters. */
  INTERNAL_API_TOKEN: z.string().min(32, "INTERNAL_API_TOKEN must have at least 32 characters"),
  /** Goes in the User-Agent; validated when the User-Agent is built. */
  SIIAU_CONTACT_EMAIL: z.string().min(1, "SIIAU_CONTACT_EMAIL is required"),
  /** Kill switch: "false" stops every request to SIIAU. */
  SIIAU_ENABLED: booleanString,
  /** Pause between two requests to SIIAU. Never below 2 s. */
  SIIAU_MIN_DELAY_MS: z.coerce.number().int().min(2000).default(3000),
  /** How long a search waits for its turn before answering "busy". */
  SIIAU_MAX_WAIT_MS: z.coerce.number().int().min(0).max(60_000).default(20_000),
  /** How long a search result is reused before asking SIIAU again. Never below 1 minute. */
  SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
  /** Tests and local development only: send SIIAU requests to a fake server at this origin. */
  SIIAU_ORIGIN_OVERRIDE: z.url().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function parseConfig(env: Record<string, unknown>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid worker configuration:\n- ${problems.join("\n- ")}`);
  }
  return result.data;
}
