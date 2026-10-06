import type { Database } from "@haycupo/db";

import type { Config } from "./config";
import { ApiError, toApiError } from "./errors";
import type { SiiauGateway } from "./gateway";
import { getSearchOptions } from "./options";
import { searchOffer } from "./search";

export interface AppContext {
  db: Database;
  gateway: SiiauGateway;
  config: Config;
}

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

function requireInternalToken(request: Request, config: Config): void {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!safeEqual(token, config.INTERNAL_API_TOKEN)) {
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

/**
 * Routes shared by every runtime (Cloudflare and Node). The routes under /internal are for
 * apps/web only and need the shared token.
 */
export function createHandler(context: AppContext): Handler {
  const { db, gateway, config } = context;
  return async (request) => {
    const url = new URL(request.url);
    try {
      if (request.method !== "GET") throw new ApiError("not_found", "Not found");
      switch (url.pathname) {
        case "/health":
          return json({ ok: true });
        case "/internal/options":
          requireInternalToken(request, config);
          return json(await getSearchOptions({ db, gateway }));
        case "/internal/search":
          requireInternalToken(request, config);
          return json(
            await searchOffer(
              { db, gateway, cacheTtlMs: config.SEARCH_CACHE_TTL_SECONDS * 1000 },
              searchInputFrom(url.searchParams),
            ),
          );
        default:
          throw new ApiError("not_found", "Not found");
      }
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.kind === "internal") console.error("Unhandled error", error);
      return errorResponse(apiError);
    }
  };
}
