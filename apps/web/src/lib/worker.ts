import "server-only";

import {
  ApiErrorResponseSchema,
  HealthResponseSchema,
  OptionsResponseSchema,
  SearchResponseSchema,
  type ApiErrorKind,
  type HealthResponse,
  type OptionsResponse,
  type SearchResponse,
} from "@haycupo/worker/contract";
import type { z } from "zod";

import { serverEnv } from "./env";
import type { SubjectQuery } from "./subject-query";

/** The worker answered with an error (or could not be reached). */
export class WorkerError extends Error {
  override name = "WorkerError";

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

async function callWorker<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit & { next?: { revalidate?: number } } = {},
): Promise<T> {
  const env = serverEnv();
  let response: Response;
  try {
    response = await fetch(new URL(path, env.WORKER_URL), {
      ...init,
      headers: { Authorization: `Bearer ${env.INTERNAL_API_TOKEN}` },
      // The worker may wait up to 20 s for its turn to ask SIIAU.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("Worker unreachable", error);
    throw new WorkerError("internal", "Worker unreachable");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(body);
    throw parsed.success
      ? new WorkerError(parsed.data.error.kind, parsed.data.error.message)
      : new WorkerError("internal", `Worker answered ${String(response.status)}`);
  }
  return schema.parse(body);
}

/** Cycles and campuses. They change a few times a year, so Next caches them for an hour. */
export function getOptions(): Promise<OptionsResponse> {
  return callWorker("/internal/options", OptionsResponseSchema, { next: { revalidate: 3600 } });
}

export function searchOffer(query: SubjectQuery): Promise<SearchResponse> {
  const params = new URLSearchParams({ cycle: query.cycle, center: query.center });
  params.set(query.kind, query.value);
  return callWorker(`/internal/search?${params.toString()}`, SearchResponseSchema, {
    cache: "no-store",
  });
}

/** The worker's public health check, or null if it does not answer within 5 seconds. */
export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(new URL("/health", serverEnv().WORKER_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const parsed = HealthResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
