/**
 * The front gate. Netlify runs it before every page and API call and counts requests per IP at
 * its edge: past the limit it answers 429 itself, before any of our code runs, so a script
 * hammering the site cannot burn the plan's compute (see docs/security.md). The function itself
 * does nothing; returning nothing lets the request through.
 *
 * 90 requests a minute is far above what a person browsing makes (a page and the links Next.js
 * prefetches are about 7) and low enough to stop a loop.
 */
export default function gate(): undefined {
  return undefined;
}

export const config = {
  path: "/*",
  excludedPath: [
    // Static files: served from Netlify's CDN, cheap, and loaded many at a time.
    "/_next/static/*",
    "/sw.js",
    "/manifest.webmanifest",
    "/icon.svg",
    "/apple-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/badge-96.png",
    // Telegram's few servers deliver every chat's messages; the webhook checks its secret and
    // limits each chat in the app instead.
    "/api/telegram/webhook",
  ],
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
