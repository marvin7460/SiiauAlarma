import "server-only";

import { bumpMetric, emailsSentToday, loginTokens, sessions, users } from "@haycupo/db";
import { magicLinkEmail } from "@haycupo/notify";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { getDb } from "./db";
import { emailTransport } from "./email";
import { serverEnv } from "./env";
import { byEmail, byIp } from "./limits";
import { normalizeEmail, randomToken, safeNext, sha256Hex } from "./tokens";

/**
 * The session cookie. Over HTTPS it carries the __Host- prefix: browsers then accept it only
 * from this exact host, Secure and with Path=/, so no other site or subdomain can plant or
 * overwrite it (session fixation). Plain "hc_sesion" in local development over HTTP.
 */
function sessionCookie(): { name: string; secure: boolean } {
  const secure = serverEnv().APP_URL.startsWith("https://");
  return { name: secure ? "__Host-hc_sesion" : "hc_sesion", secure };
}
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;
/** Magic links per address per 15 minutes: enough for a typo, too few to spam someone. */
const LINKS_PER_WINDOW = 3;

export type RequestLinkResult =
  | { ok: true; email: string }
  | {
      ok: false;
      error:
        "invalid_email" | "too_many_links" | "too_many_requests" | "email_quota" | "send_failed";
    };

/** Emails a single-use sign-in link. Accounts are created on first sign-in. */
export async function requestMagicLink(
  rawEmail: string,
  next: string | null,
): Promise<RequestLinkResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "invalid_email" };
  const db = getDb();
  const env = serverEnv();
  const now = new Date();

  const [recent] = await db
    .select({ links: count() })
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.email, email),
        gt(loginTokens.createdAt, new Date(now.getTime() - LINK_MINUTES * 60_000)),
      ),
    );
  if ((recent?.links ?? 0) >= LINKS_PER_WINDOW) return { ok: false, error: "too_many_links" };
  // One person cannot mail many addresses, or one address all day (or burn the daily quota).
  if (!(await byIp("loginLinksPerIp"))) return { ok: false, error: "too_many_requests" };
  if (!(await byEmail("loginLinksPerEmail", email))) return { ok: false, error: "too_many_links" };
  if ((await emailsSentToday(db, now)) >= env.EMAIL_DAILY_LIMIT) {
    return { ok: false, error: "email_quota" };
  }

  const token = randomToken();
  await db.insert(loginTokens).values({
    tokenHash: await sha256Hex(token),
    email,
    next: safeNext(next),
    createdAt: now,
    expiresAt: new Date(now.getTime() + LINK_MINUTES * 60_000),
  });
  const url = new URL(`/entrar/confirmar?token=${token}`, env.APP_URL).href;
  try {
    await emailTransport().send({ to: email, ...magicLinkEmail(url) });
  } catch (error) {
    console.error("Magic link email failed", error);
    return { ok: false, error: "send_failed" };
  }
  await bumpMetric(db, "emailsSent", now);
  return { ok: true, email };
}

/**
 * Uses up a magic link and starts a session. The UPDATE … WHERE used_at IS NULL makes the
 * link single-use even if it is clicked twice at once. Returns where to go next, or null.
 */
export async function signInWithToken(token: string): Promise<string | null> {
  const db = getDb();
  const now = new Date();
  const [link] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(loginTokens.tokenHash, await sha256Hex(token)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, now),
      ),
    )
    .returning({ email: loginTokens.email, next: loginTokens.next });
  if (!link) return null;

  const [user] = await db
    .insert(users)
    .values({ email: link.email })
    .onConflictDoUpdate({ target: users.email, set: { email: sql`excluded.email` } })
    .returning({ id: users.id });
  if (!user) return null;

  const sessionId = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60_000);
  await db
    .insert(sessions)
    .values({ idHash: await sha256Hex(sessionId), userId: user.id, expiresAt });
  const store = await cookies();
  const cookie = sessionCookie();
  store.set(cookie.name, sessionId, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return safeNext(link.next);
}

export interface CurrentUser {
  id: string;
  email: string;
  emailNotifications: boolean;
}

/** The signed-in student, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sessionId = (await cookies()).get(sessionCookie().name)?.value;
  if (!sessionId) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email, emailNotifications: users.emailNotifications })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(eq(sessions.idHash, await sha256Hex(sessionId)), gt(sessions.expiresAt, new Date())),
    );
  return row ?? null;
});

export async function signOut(): Promise<void> {
  const store = await cookies();
  const cookie = sessionCookie();
  const sessionId = store.get(cookie.name)?.value;
  if (sessionId) {
    await getDb()
      .delete(sessions)
      .where(eq(sessions.idHash, await sha256Hex(sessionId)));
  }
  // Same attributes as when it was set: browsers ignore a __Host- cookie without them.
  store.set(cookie.name, "", {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
