import { z } from "zod";

import type { HealthResponse } from "./contract";
import { ApiError, toApiError } from "./errors";
import { dispatchNotifications } from "./dispatch";
import { dispatchDeps, runCycle, setBrake, type JobContext } from "./jobs";
import { handleTelegramUpdate } from "./telegram-bot";
import { APP_VERSION } from "./version";

export type AppContext = JobContext;

export type Handler = (request: Request) => Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function errorResponse(error: ApiError): Response {
  return json({ error: { kind: error.kind, message: error.message } }, error.status);
}

/** Compares in time independent of where the strings differ, so the token cannot be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function requireInternalToken(request: Request, token: string): void {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!safeEqual(given, token)) {
    throw new ApiError("unauthorized", "Missing or wrong internal API token");
  }
}

const BrakeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pause"),
    minutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60),
    reason: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal("resume") }),
]);

type Route = (request: Request, url: URL) => Promise<Response>;

/**
 * The engine's HTTP routes, framework-free (Request in, Response out). The site mounts them
 * under /api (`basePath`). Everything under /internal is for operators and tests, and needs
 * INTERNAL_API_TOKEN.
 */
export function createHandler(context: AppContext, { basePath = "" } = {}): Handler {
  const { db, config } = context;

  const routes: Record<string, Route | undefined> = {
    "GET /health": () =>
      Promise.resolve(
        json({
          ok: true,
          version: APP_VERSION,
          siiauEnabled: config.SIIAU_ENABLED,
          scheduler: config.SCHEDULER_ENABLED,
          channels: {
            email: context.email !== null,
            telegram: context.telegram !== null,
            push: context.vapid !== null,
          },
        } satisfies HealthResponse),
      ),
    // Run a whole poll cycle now (the scheduler does this every minute; for tests and operators).
    "POST /internal/poll": async () => json(await runCycle(context)),
    "POST /internal/dispatch": async () =>
      json(await dispatchNotifications(dispatchDeps(context), { limit: 30 })),
    // Emergency brake: {"action":"pause","minutes":60,"reason":"..."} or {"action":"resume"}.
    "POST /internal/brake": async (request) => {
      const parsed = BrakeSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) throw new ApiError("invalid_query", "Expected pause or resume");
      await setBrake(db, parsed.data);
      return json({ ok: true });
    },
    // Telegram bot updates. Telegram proves it is the caller with the secret set in setWebhook.
    "POST /telegram/webhook": async (request) => {
      const secret = config.TELEGRAM_WEBHOOK_SECRET;
      if (!config.TELEGRAM_BOT_TOKEN || !secret) throw new ApiError("not_found", "Not found");
      const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
      if (!safeEqual(given, secret)) throw new ApiError("unauthorized", "Wrong webhook secret");
      const update: unknown = await request.json().catch(() => null);
      const reply = await handleTelegramUpdate({ db, appUrl: config.APP_URL }, update);
      return json(reply ?? {});
    },
  };

  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length)
      : url.pathname;
    try {
      const route = routes[`${request.method} ${path}`];
      if (!route) throw new ApiError("not_found", "Not found");
      if (path.startsWith("/internal/")) {
        requireInternalToken(request, config.INTERNAL_API_TOKEN);
      }
      return await route(request, url);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.kind === "internal") console.error("Unhandled error", error);
      return errorResponse(apiError);
    }
  };
}
