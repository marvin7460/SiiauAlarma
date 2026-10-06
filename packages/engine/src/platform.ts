/**
 * Whether this process is a serverless function (Netlify runs functions on AWS Lambda). A
 * function is frozen between requests and has a time limit (10 s for a page on Netlify), so
 * it keeps no timer, runs no migrations on start, and waits less for SIIAU.
 */
export function isServerless(env: Record<string, unknown>): boolean {
  return Boolean(env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT);
}

/**
 * Defaults that fit a serverless function. A page has 10 s: at most 2.5 s waiting for the turn
 * to ask SIIAU and 5.5 s for SIIAU to answer, leaving room for the start-up and the database.
 * A scheduled run polls one subject, so it never pays (in time or credits) for the pause
 * between requests; the next run is a minute later. Values set in the environment still win.
 */
export const SERVERLESS_DEFAULTS = {
  SIIAU_MAX_WAIT_MS: "2500",
  SIIAU_TIMEOUT_MS: "5500",
  POLL_MAX_SUBJECTS_PER_RUN: "1",
} as const;
