import {
  InvalidQueryError,
  SiiauHttpError,
  SiiauIncompleteResultsError,
  SiiauParseError,
} from "@haycupo/siiau";

import type { ApiErrorKind, ApiProblem } from "./contract";
import {
  GatewayBlockedError,
  GatewayBusyError,
  GatewayPausedError,
  SiiauNetworkError,
} from "./gateway";

/** An error that maps to a JSON answer with a stable `kind`. */
export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.kind];
  }
}

const STATUS: Record<ApiErrorKind, number> = {
  invalid_query: 400,
  unauthorized: 401,
  not_found: 404,
  siiau_unavailable: 502,
  siiau_changed: 502,
  busy: 503,
  paused: 503,
  blocked: 503,
  internal: 500,
};

/** Maps anything thrown while talking to SIIAU to the problem the user should see. */
export function toProblem(error: unknown): ApiProblem {
  if (error instanceof ApiError) return { kind: error.kind, message: error.message };
  if (error instanceof InvalidQueryError) return { kind: "invalid_query", message: error.message };
  if (error instanceof GatewayPausedError) return { kind: "paused", message: error.message };
  if (error instanceof GatewayBusyError) return { kind: "busy", message: error.message };
  if (error instanceof GatewayBlockedError) return { kind: "blocked", message: error.message };
  if (error instanceof SiiauHttpError || error instanceof SiiauNetworkError) {
    return { kind: "siiau_unavailable", message: error.message };
  }
  if (error instanceof SiiauParseError || error instanceof SiiauIncompleteResultsError) {
    return { kind: "siiau_changed", message: error.message };
  }
  return { kind: "internal", message: "Unexpected error" };
}

export function toApiError(error: unknown): ApiError {
  const problem = toProblem(error);
  return error instanceof ApiError ? error : new ApiError(problem.kind, problem.message);
}
