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

/** A search: a recent shared result if there is one, otherwise SIIAU through the gateway. */
export async function searchOffer(query: SubjectQuery): Promise<SearchResponse> {
  const { db, gateway, config } = getEngine().context;
  try {
    return await engineSearchOffer(
      { db, gateway, cacheTtlMs: config.SEARCH_CACHE_TTL_SECONDS * 1000 },
      query,
    );
  } catch (error) {
    throw asSearchError(error);
  }
}
