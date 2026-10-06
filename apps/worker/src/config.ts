import { z } from "zod";

const booleanString = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

/** Empty variables (`FOO=` in a .env file) count as unset. */
const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankAsUndefined, schema.optional());
const withDefault = <T extends z.ZodType>(schema: T) => z.preprocess(blankAsUndefined, schema);

/**
 * Settings read from the environment (Cloudflare vars/secrets or process.env). Every limit that
 * protects SIIAU has a safe default and a floor that cannot be configured away.
 */
export const ConfigSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    /** Shared secret between apps/web and this worker. At least 32 characters. */
    INTERNAL_API_TOKEN: z.string().min(32, "INTERNAL_API_TOKEN must have at least 32 characters"),
    /** Goes in the User-Agent; validated when the User-Agent is built. */
    SIIAU_CONTACT_EMAIL: z.string().min(1, "SIIAU_CONTACT_EMAIL is required"),
    /** Kill switch: "false" stops every request to SIIAU. */
    SIIAU_ENABLED: withDefault(booleanString("true")),
    /** Pause between two requests to SIIAU. Never below 2 s. */
    SIIAU_MIN_DELAY_MS: withDefault(z.coerce.number().int().min(2000).default(3000)),
    /** How long a search waits for its turn before answering "busy". */
    SIIAU_MAX_WAIT_MS: withDefault(z.coerce.number().int().min(0).max(60_000).default(20_000)),
    /** How long a search result is reused before asking SIIAU again. Never below 1 minute. */
    SEARCH_CACHE_TTL_SECONDS: withDefault(z.coerce.number().int().min(60).default(300)),
    /** Tests and local development only: send SIIAU requests to a fake server at this origin. */
    SIIAU_ORIGIN_OVERRIDE: optional(z.url()),

    /** Public URL of apps/web, for links in messages. */
    APP_URL: withDefault(z.url().default("http://127.0.0.1:3000")),
    /** Signs "cancel this alert" links. Shared with apps/web. At least 32 characters. */
    APP_SECRET: z.string().min(32, "APP_SECRET must have at least 32 characters"),

    /** resend in production; file for end-to-end tests; log for local development. */
    EMAIL_TRANSPORT: withDefault(z.enum(["resend", "file", "log"]).default("log")),
    RESEND_API_KEY: optional(z.string().min(1)),
    EMAIL_FROM: withDefault(z.string().min(3).default("¿Hay Cupo? <onboarding@resend.dev>")),
    EMAIL_FILE_DIR: optional(z.string().min(1)),
    /** Resend's free plan allows 100 emails a day; keep some room for sign-in links. */
    EMAIL_DAILY_LIMIT: withDefault(z.coerce.number().int().min(0).default(90)),

    /** Usual interval per watched subject. Never below 2 minutes. */
    POLL_INTERVAL_SECONDS: withDefault(z.coerce.number().int().min(120).default(300)),
    /** Interval during the cycle's registration week. Never below 2 minutes. */
    POLL_REGISTRATION_INTERVAL_SECONDS: withDefault(z.coerce.number().int().min(120).default(120)),
    /** Interval for subjects whose offer is not published yet. */
    POLL_UNPUBLISHED_INTERVAL_SECONDS: withDefault(z.coerce.number().int().min(600).default(3600)),
    /** Subjects polled per cron run, at most. */
    POLL_MAX_SUBJECTS_PER_RUN: withDefault(z.coerce.number().int().min(1).max(50).default(15)),
    /** An alert notifies at most once per this many minutes. */
    NOTIFY_COOLDOWN_MINUTES: withDefault(z.coerce.number().int().min(5).default(30)),
    /** inline: poll in the cron invocation; fanout: one Worker invocation per subject. */
    POLL_MODE: withDefault(z.enum(["inline", "fanout"]).default("inline")),
  })
  .superRefine((config, context) => {
    if (config.EMAIL_TRANSPORT === "resend" && !config.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "required with resend",
      });
    }
    if (config.EMAIL_TRANSPORT === "file" && !config.EMAIL_FILE_DIR) {
      context.addIssue({ code: "custom", path: ["EMAIL_FILE_DIR"], message: "required with file" });
    }
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
