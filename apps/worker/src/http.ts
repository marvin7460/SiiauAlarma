import { z } from "zod";

import { ApiError, toApiError } from "./errors";
import { dispatchNotifications } from "./dispatch";
import { dispatchDeps, pollOne, runCycle, setBrake, type JobContext } from "./jobs";
import { getSearchOptions } from "./options";
import { searchOffer } from "./search";

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

function searchInputFrom(params: URLSearchParams) {
  const cycle = params.get("cycle") ?? "";
  const center = params.get("center") ?? "";
  const code = params.get("code");
  const name = params.get("name");
  if (code) return { cycle, center, kind: "code" as const, value: code };
  if (name) return { cycle, center, kind: "name" as const, value: name };
  throw new ApiError("invalid_query", "Pass `code` or `name`");
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
 * Routes shared by every runtime (Cloudflare and Node). Everything under /internal is for
 * apps/web and for operators, and needs the shared token.
 */
export function createHandler(context: AppContext): Handler {
  const { db, gateway, config } = context;

  const routes: Record<string, Route | undefined> = {
    "GET /health": () => Promise.resolve(json({ ok: true })),
    "GET /internal/options": async () => json(await getSearchOptions({ db, gateway })),
    "GET /internal/search": async (_request, url) =>
      json(
        await searchOffer(
          { db, gateway, cacheTtlMs: config.SEARCH_CACHE_TTL_SECONDS * 1000 },
          searchInputFrom(url.searchParams),
        ),
      ),
    // Run a whole poll cycle now (cron does this every minute; useful for tests and operators).
    "POST /internal/poll": async () => json(await runCycle(context)),
    // Poll the most overdue subject (Cloudflare fan-out: one invocation per subject).
    "POST /internal/poll-one": async () => json(await pollOne(context)),
    "POST /internal/dispatch": async () =>
      json(await dispatchNotifications(dispatchDeps(context), { limit: 30 })),
    // Emergency brake: {"action":"pause","minutes":60,"reason":"..."} or {"action":"resume"}.
    "POST /internal/brake": async (request) => {
      const parsed = BrakeSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) throw new ApiError("invalid_query", "Expected pause or resume");
      await setBrake(db, parsed.data);
      return json({ ok: true });
    },
  };

  return async (request) => {
    const url = new URL(request.url);
    try {
      const route = routes[`${request.method} ${url.pathname}`];
      if (!route) throw new ApiError("not_found", "Not found");
      if (url.pathname.startsWith("/internal/")) {
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
