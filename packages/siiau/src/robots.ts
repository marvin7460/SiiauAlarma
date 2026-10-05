import robotsParser from "robots-parser";

export interface RobotsPolicy {
  /** Whether our user agent may fetch this URL. URLs from another origin are never allowed. */
  isAllowed(url: URL): boolean;
  /** Crawl-delay requested for our user agent, in milliseconds, if any. */
  crawlDelayMs: number | undefined;
}

export interface RobotsResponse {
  robotsUrl: URL;
  status: number;
  body: string;
  userAgent: string;
}

/**
 * Turns the robots.txt response into a crawl policy, following RFC 9309 §2.3.1:
 * - 2xx: obey the group for our product token, or `*` if there is none.
 * - 4xx: robots.txt is "unavailable", so there are no restrictions.
 * - anything else (5xx, odd statuses): "unreachable", so assume everything is disallowed.
 *   429 Too Many Requests also lands here: the server is asking us to back off.
 */
export function robotsPolicyFromResponse({
  robotsUrl,
  status,
  body,
  userAgent,
}: RobotsResponse): RobotsPolicy {
  if (status >= 200 && status < 300) {
    const robots = robotsParser(robotsUrl.href, body);
    const crawlDelaySeconds = robots.getCrawlDelay(userAgent);
    return {
      isAllowed: (url) => robots.isAllowed(url.href, userAgent) === true,
      crawlDelayMs: crawlDelaySeconds === undefined ? undefined : crawlDelaySeconds * 1000,
    };
  }
  if (status >= 400 && status < 500 && status !== 429) {
    return {
      isAllowed: (url) => url.origin === robotsUrl.origin,
      crawlDelayMs: undefined,
    };
  }
  return unreachableRobotsPolicy();
}

/** Policy for when robots.txt could not be fetched at all (network error, timeout, 5xx). */
export function unreachableRobotsPolicy(): RobotsPolicy {
  return { isAllowed: () => false, crawlDelayMs: undefined };
}
