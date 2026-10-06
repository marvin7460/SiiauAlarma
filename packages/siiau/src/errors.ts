/** Base class, so callers can tell SIIAU problems apart from bugs in our own code. */
export class SiiauError extends Error {
  override name = "SiiauError";
}

/** SIIAU answered, but not with 200. */
export class SiiauHttpError extends SiiauError {
  override name = "SiiauHttpError";

  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`SIIAU answered HTTP ${status} for ${url}`);
  }
}

/**
 * The page did not look like we expect. Usually means SIIAU changed its HTML: the poller must
 * report it and stay quiet rather than guess (and send false alerts).
 */
export class SiiauParseError extends SiiauError {
  override name = "SiiauParseError";

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** The footer announces more records than the page contains. */
export class SiiauIncompleteResultsError extends SiiauError {
  override name = "SiiauIncompleteResultsError";

  constructor(
    readonly totalRecords: number,
    readonly received: number,
  ) {
    super(`SIIAU reported ${totalRecords} records but the page has ${received}`);
  }
}
