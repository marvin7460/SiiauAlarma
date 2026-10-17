import { rateLimits, type Database } from "@haycupo/db";
import { sql } from "drizzle-orm";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface Limit {
  /** Most hits allowed in one window. */
  max: number;
  windowMs: number;
}

/**
 * How much one person (or everyone together) may do. Generous for a student, tight for a script.
 * The edge in front of the site also caps requests per IP (apps/web/netlify/edge-functions).
 */
export const LIMITS = {
  /** Sign-in links requested from one IP: stops one person mailing many addresses. */
  loginLinksPerIp: { max: 6, windowMs: HOUR },
  /** Sign-in links to one address in a day (on top of 3 per 15 minutes): no inbox flooding. */
  loginLinksPerEmail: { max: 8, windowMs: DAY },
  /** Searches from one IP that need SIIAU (cached results are free). */
  siiauSearchesPerIp: { max: 12, windowMs: 10 * MINUTE },
  /** Searches that need SIIAU, everyone together: the gateway always has room for alerts. */
  siiauSearchesGlobal: { max: 10, windowMs: MINUTE },
  alertsPerUser: { max: 30, windowMs: HOUR },
  telegramCodesPerUser: { max: 10, windowMs: HOUR },
  pushSavesPerUser: { max: 20, windowMs: HOUR },
  exportsPerUser: { max: 10, windowMs: HOUR },
  /** Messages to the bot from one chat; past this the bot stays quiet. */
  botMessagesPerChat: { max: 20, windowMs: MINUTE },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

/** How long counters are kept: the longest window. */
export const RATE_LIMIT_RETENTION_MS = DAY;

/**
 * Counts one hit on `key` and says whether it is still within the limit. Fixed windows: one
 * atomic write per check, precise enough to stop abuse. In an UPDATE, SQLite reads the old row
 * on every right-hand side, so a new window restarts the count at 1.
 */
export async function takeHit(
  db: Database,
  key: string,
  limit: Limit,
  now = new Date(),
): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, hits: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        hits: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.hits} + 1 else 1 end`,
        windowStart: sql`excluded.window_start`,
      },
    })
    .returning({ hits: rateLimits.hits });
  return (row?.hits ?? 1) <= limit.max;
}

/** Shorthand: counts a hit for `LIMITS[name]` on `subject` (an id or a fingerprint). */
export function allow(
  db: Database,
  name: LimitName,
  subject: string,
  now?: Date,
): Promise<boolean> {
  return takeHit(db, `${name}:${subject}`, LIMITS[name], now);
}

/**
 * An HMAC of an IP address or an email, so counters never hold it in clear and it cannot be
 * reversed without the app's secret. 128 bits, base64url.
 */
export async function fingerprint(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`limits:${value}`)),
  );
  let binary = "";
  for (const byte of mac.slice(0, 16)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
