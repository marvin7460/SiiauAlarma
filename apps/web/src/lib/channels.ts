import "server-only";

import type { Channel } from "@haycupo/core";
import { pushSubscriptions, telegramLinkTokens, users } from "@haycupo/db";
import { isKnownPushService } from "@haycupo/notify";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "./db";
import { serverEnv } from "./env";
import { randomToken, sha256Hex } from "./tokens";

const LINK_MINUTES = 15;
/** Phone, laptop, tablet… more than this is surely old subscriptions nobody uses. */
const MAX_PUSH_DEVICES = 10;

export interface ChannelSettings {
  telegram: { available: boolean; linked: boolean; botUsername: string | null };
  push: { available: boolean; publicKey: string | null; devices: number };
}

/** Which channels this site offers and which ones the student set up. */
export async function getChannelSettings(userId: string): Promise<ChannelSettings> {
  const env = serverEnv();
  const db = getDb();
  const [user] = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, userId));
  const [devices] = await db
    .select({ total: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return {
    telegram: {
      available: Boolean(env.TELEGRAM_BOT_USERNAME),
      linked: user?.chatId != null,
      botUsername: env.TELEGRAM_BOT_USERNAME ?? null,
    },
    push: {
      available: Boolean(env.VAPID_PUBLIC_KEY),
      publicKey: env.VAPID_PUBLIC_KEY ?? null,
      devices: devices?.total ?? 0,
    },
  };
}

/** The channels of a new alert, minus the ones that could not reach the student. */
export function usableChannels(wanted: readonly Channel[], settings: ChannelSettings): Channel[] {
  return wanted.filter(
    (channel) =>
      channel === "email" ||
      (channel === "telegram" && settings.telegram.available && settings.telegram.linked) ||
      (channel === "push" && settings.push.available && settings.push.devices > 0),
  );
}

/**
 * A t.me link that opens the bot with a one-use code. When the student presses "Start", the
 * bot receives the code and links that chat to this account (apps/worker/src/telegram-bot.ts).
 */
export async function createTelegramLink(userId: string): Promise<string | null> {
  const bot = serverEnv().TELEGRAM_BOT_USERNAME;
  if (!bot) return null;
  const db = getDb();
  const code = randomToken();
  const now = new Date();
  // Only the newest code works: clicking twice should not leave two valid codes around.
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.userId, userId));
  await db.insert(telegramLinkTokens).values({
    tokenHash: await sha256Hex(code),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + LINK_MINUTES * 60_000),
  });
  return `https://t.me/${bot}?start=${code}`;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ telegramChatId: null, telegramLinkedAt: null })
    .where(eq(users.id, userId));
}

const base64Url = z.string().regex(/^[\w-]+=*$/);

/** What `PushSubscription.toJSON()` gives in the browser. */
export const PushSubscriptionSchema = z.object({
  endpoint: z
    .url({ protocol: /^https$/ })
    .max(1000)
    .refine(isKnownPushService),
  keys: z.object({ p256dh: base64Url.min(80).max(100), auth: base64Url.min(16).max(32) }),
});

/** Saves (or moves to this account) a browser subscription. */
export async function savePushSubscription(userId: string, input: unknown): Promise<boolean> {
  const parsed = PushSubscriptionSchema.safeParse(input);
  if (!parsed.success || !serverEnv().VAPID_PUBLIC_KEY) return false;
  const { endpoint, keys } = parsed.data;
  const db = getDb();
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth, failureCount: 0 },
    });
  const devices = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
  const oldest = devices.slice(MAX_PUSH_DEVICES).map((row) => row.id);
  if (oldest.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, oldest));
  }
  return true;
}

export async function removePushSubscription(userId: string, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== "string") return;
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
