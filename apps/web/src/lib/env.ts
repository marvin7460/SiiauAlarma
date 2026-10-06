import "server-only";

import { z } from "zod";

const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const ServerEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    /** Where apps/worker answers, e.g. https://haycupo-worker.<you>.workers.dev */
    WORKER_URL: z.url(),
    INTERNAL_API_TOKEN: z.string().min(32),
    /** Public URL of this site, for links in emails. */
    APP_URL: z.preprocess(blankAsUndefined, z.url().default("http://127.0.0.1:3000")),
    /** Signs "cancel this alert" links; shared with apps/worker. */
    APP_SECRET: z.string().min(32),
    EMAIL_TRANSPORT: z.preprocess(
      blankAsUndefined,
      z.enum(["resend", "file", "log"]).default("log"),
    ),
    RESEND_API_KEY: z.preprocess(blankAsUndefined, z.string().optional()),
    EMAIL_FROM: z.preprocess(
      blankAsUndefined,
      z.string().default("¿Hay Cupo? <onboarding@resend.dev>"),
    ),
    EMAIL_FILE_DIR: z.preprocess(blankAsUndefined, z.string().optional()),
    EMAIL_DAILY_LIMIT: z.preprocess(blankAsUndefined, z.coerce.number().int().min(0).default(90)),
    /** The bot's @username without the @ (e.g. HayCupoBot). Without it, Telegram is hidden. */
    TELEGRAM_BOT_USERNAME: z.preprocess(
      blankAsUndefined,
      z
        .string()
        .regex(/^\w{5,32}$/)
        .optional(),
    ),
    /** Public half of the VAPID pair (the worker has both). Without it, push is hidden. */
    VAPID_PUBLIC_KEY: z.preprocess(blankAsUndefined, z.string().min(80).optional()),
  })
  .refine((env) => env.EMAIL_TRANSPORT !== "resend" || Boolean(env.RESEND_API_KEY), {
    message: "RESEND_API_KEY is required with EMAIL_TRANSPORT=resend",
  })
  .refine((env) => env.EMAIL_TRANSPORT !== "file" || Boolean(env.EMAIL_FILE_DIR), {
    message: "EMAIL_FILE_DIR is required with EMAIL_TRANSPORT=file",
  });

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

/** Server-only settings, validated on first use so a missing variable fails loudly. */
export function serverEnv(): ServerEnv {
  cached ??= ServerEnvSchema.parse(process.env);
  return cached;
}
