import "server-only";

import {
  getSearchOptions,
  searchOffer as engineSearchOffer,
  toApiError,
  type ApiErrorKind,
  type OptionsResponse,
  type SearchResponse,
} from "@haycupo/engine";

import { getEngine } from "./engine";
import { byEveryone, byIp } from "./limits";
import type { SubjectQuery } from "./subject-query";

/** SIIAU could not answer the way we need (down, changed, busy, paused…). */
export class SearchError extends Error {
  override name = "SearchError";

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

function asSearchError(error: unknown): SearchError {
  const apiError = toApiError(error);
  if (apiError.kind === "internal") console.error("Search failed", error);
  return new SearchError(apiError.kind, apiError.message);
}

/** Cycles and campuses, from the database; refreshed from SIIAU's form at most once a day. */
export async function getOptions(): Promise<OptionsResponse> {
  const { db, gateway } = getEngine().context;
  try {
    return await getSearchOptions({ db, gateway });
  } catch (error) {
    throw asSearchError(error);
  }
}

/**
 * A search: a recent shared result if there is one, otherwise SIIAU through the gateway.
 * Cycles and campuses must be real ones (no request to SIIAU for made-up values), and searches
 * that need SIIAU are limited per visitor and for everyone together (see LIMITS).
 */
export async function searchOffer(query: SubjectQuery): Promise<SearchResponse> {
  const { db, gateway, config } = getEngine().context;
  const options = await getOptions().catch(() => null);
  if (
    options &&
    options.cycles.length > 0 &&
    (!options.cycles.some((cycle) => cycle.code === query.cycle) ||
      !options.centers.some((center) => center.code === query.center))
  ) {
    throw new SearchError("invalid_query", "Unknown cycle or campus");
  }
  try {
    return await engineSearchOffer(
      {
        db,
        gateway,
        cacheTtlMs: config.SEARCH_CACHE_TTL_SECONDS * 1000,
        allowFetch: async () =>
          (await byIp("siiauSearchesPerIp")) && (await byEveryone("siiauSearchesGlobal")),
      },
      query,
    );
  } catch (error) {
    throw asSearchError(error);
  }
}
