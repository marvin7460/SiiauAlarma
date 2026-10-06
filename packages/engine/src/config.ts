import { z } from "zod";

import { SERVERLESS_DEFAULTS, isServerless } from "./platform";

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
 * Settings read from the environment (process.env). Every limit that protects SIIAU has a safe
 * default and a floor that cannot be configured away.
 */
export const ConfigSchema = z
  .object({
    /** `libsql://<db>-<org>.turso.io` in production, `file:./data/local.db` in development. */
    TURSO_DATABASE_URL: z.string().regex(/^(libsql|https?|wss?|file):/, "libsql://… or file:…"),
    /** Turso database token (`turso db tokens create <db>`). Not needed for a local file. */
    TURSO_AUTH_TOKEN: optional(z.string().min(1)),
    /** Apply pending migrations when the server starts, before it takes requests. */
    MIGRATE_ON_START: withDefault(booleanString("true")),
    /** Where the migrations are, when the server runs from a bundle (see the Dockerfile). */
    MIGRATIONS_DIR: optional(z.string().min(1)),
    /**
     * Poll every minute: inside the server, or in the scheduled function on Netlify. Tests turn
     * it off and poll on demand.
     */
    SCHEDULER_ENABLED: withDefault(booleanString("true")),
    /** Protects /api/internal/* (manual poll, emergency brake). At least 32 characters. */
    INTERNAL_API_TOKEN: z.string().min(32, "INTERNAL_API_TOKEN must have at least 32 characters"),
    /** Goes in the User-Agent; validated when the User-Agent is built. */
    SIIAU_CONTACT_EMAIL: z.string().min(1, "SIIAU_CONTACT_EMAIL is required"),
    /** Kill switch: "false" stops every request to SIIAU. */
    SIIAU_ENABLED: withDefault(booleanString("true")),
    /** Pause between two requests to SIIAU. Never below 2 s. */
    SIIAU_MIN_DELAY_MS: withDefault(z.coerce.number().int().min(2000).default(3000)),
    /** How long a search waits for its turn before answering "busy". */
    SIIAU_MAX_WAIT_MS: withDefault(z.coerce.number().int().min(0).max(60_000).default(20_000)),
    /**
     * How long one request to SIIAU may take. On Netlify a page has 10 s in total, so the turn
     * (SIIAU_MAX_WAIT_MS) plus this must fit; there the defaults are 2.5 s and 5.5 s.
     */
    SIIAU_TIMEOUT_MS: withDefault(z.coerce.number().int().min(3000).max(30_000).default(20_000)),
    /** How long a search result is reused before asking SIIAU again. Never below 1 minute. */
    SEARCH_CACHE_TTL_SECONDS: withDefault(z.coerce.number().int().min(60).default(300)),
    /** Tests and local development only: send SIIAU requests to a fake server at this origin. */
    SIIAU_ORIGIN_OVERRIDE: optional(z.url()),

    /** Public URL of the site, for links in messages. */
    APP_URL: withDefault(z.url().default("http://127.0.0.1:3000")),
    /** Signs "cancel this alert" links. At least 32 characters. */
    APP_SECRET: z.string().min(32, "APP_SECRET must have at least 32 characters"),

    /** resend in production; file (JSON files) for end-to-end tests; log for development. */
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

    /** From @BotFather. Without it the Telegram channel is off. */
    TELEGRAM_BOT_TOKEN: optional(z.string().regex(/^\d+:[\w-]+$/, "looks wrong")),
    /** Telegram sends it in a header with every update; proves the webhook call is real. */
    TELEGRAM_WEBHOOK_SECRET: optional(
      z.string().regex(/^[\w-]{16,256}$/, "16+ chars: A-Z a-z 0-9 _ -"),
    ),

    /** The bot's username without the @ (e.g. HayCupoBot), for the "Conectar Telegram" link. */
    TELEGRAM_BOT_USERNAME: optional(z.string().regex(/^\w{5,32}$/)),
    /** Tests only: a fake Bot API instead of https://api.telegram.org. */
    TELEGRAM_API_ORIGIN: optional(z.url()),

    /** Web Push keys (pnpm --filter @haycupo/notify vapid). Without them push is off. */
    VAPID_PUBLIC_KEY: optional(z.string().min(80)),
    VAPID_PRIVATE_KEY: optional(z.string().min(40)),
    /** Contact for push services, e.g. mailto:you@example.com. Defaults to SIIAU_CONTACT_EMAIL. */
    VAPID_SUBJECT: optional(z.string().regex(/^(mailto:|https:)/)),
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
    if (config.TELEGRAM_BOT_TOKEN && !config.TELEGRAM_BOT_USERNAME) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_USERNAME"],
        message: "required with TELEGRAM_BOT_TOKEN",
      });
    }
    if (config.TELEGRAM_BOT_TOKEN && !config.TELEGRAM_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_WEBHOOK_SECRET"],
        message: "required with TELEGRAM_BOT_TOKEN",
      });
    }
    if (Boolean(config.VAPID_PUBLIC_KEY) !== Boolean(config.VAPID_PRIVATE_KEY)) {
      context.addIssue({
        code: "custom",
        path: ["VAPID_PRIVATE_KEY"],
        message: "set both VAPID keys",
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

/** `FOO=` counts as unset, so it does not hide a platform default. */
function dropBlank(env: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function parseConfig(env: Record<string, unknown>): Config {
  // On Netlify, URL is the site's public address: a sensible APP_URL when none is set.
  const siteUrl = typeof env.URL === "string" && env.URL !== "" ? { APP_URL: env.URL } : {};
  const withDefaults = isServerless(env)
    ? { ...SERVERLESS_DEFAULTS, ...siteUrl, ...dropBlank(env) }
    : env;
  const result = ConfigSchema.safeParse(withDefaults);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  }
  return result.data;
}
