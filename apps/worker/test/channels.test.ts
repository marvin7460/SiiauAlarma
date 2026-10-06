import { DEFAULT_SCHEDULE } from "@haycupo/core";
import {
  alerts,
  metricsDaily,
  notifications,
  pushSubscriptions,
  telegramLinkTokens,
  users,
  watchedSubjects,
  type Database,
} from "@haycupo/db";
import {
  TelegramError,
  createMemoryTransport,
  type TelegramClient,
  type VapidConfig,
} from "@haycupo/notify";
import { generateVapidKeys } from "@haycupo/notify/vapid-keys";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { dispatchNotifications, type DispatchDeps } from "../src/dispatch";
import { createHandler } from "../src/http";
import { runPollCycle } from "../src/poll";
import { handleTelegramUpdate, parseCommand, sha256Hex } from "../src/telegram-bot";
import { testConfig, useHarness } from "./harness";

const MINUTE = 60_000;
const CHAT_ID = 5_550_001;

function fakeTelegram(fail?: TelegramError) {
  const sent: { chatId: number; html: string }[] = [];
  const client: TelegramClient = {
    sendMessage(chatId, html) {
      if (fail) return Promise.reject(fail);
      sent.push({ chatId, html });
      return Promise.resolve();
    },
    call: () => Promise.resolve(null),
  };
  return { client, sent };
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** What a browser gives us after `pushManager.subscribe()`. */
async function browserSubscription(endpoint: string) {
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  return {
    endpoint,
    p256dh: toBase64Url(await crypto.subtle.exportKey("raw", keys.publicKey)),
    auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

function pushService(statusFor: (endpoint: string) => number) {
  const requests: string[] = [];
  const fetch = ((input: string | URL | Request) => {
    const endpoint = input instanceof Request ? input.url : String(input);
    requests.push(endpoint);
    return Promise.resolve(new Response(null, { status: statusFor(endpoint) }));
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

async function createUser(db: Database, values: { email: string; telegramChatId?: number }) {
  const [user] = await db.insert(users).values(values).returning();
  if (!user) throw new Error("setup failed");
  return user;
}

async function createAlert(
  db: Database,
  userId: string,
  values: { channels: ("email" | "telegram" | "push")[]; at: Date; kind?: "section" | "offer" },
) {
  const [subject] = await db
    .insert(watchedSubjects)
    .values({ cycle: "202620", center: "D", subjectCode: "I5890", nextPollAt: values.at })
    .onConflictDoUpdate({
      target: [watchedSubjects.cycle, watchedSubjects.center, watchedSubjects.subjectCode],
      set: { nextPollAt: values.at },
    })
    .returning();
  if (!subject) throw new Error("setup failed");
  const [alert] = await db
    .insert(alerts)
    .values({
      userId,
      watchedSubjectId: subject.id,
      kind: values.kind ?? "section",
      nrc: values.kind === "offer" ? null : "78088",
      channels: values.channels,
      expiresAt: new Date(values.at.getTime() + 30 * 24 * 60 * MINUTE),
      createdAt: values.at,
    })
    .returning();
  if (!alert) throw new Error("setup failed");
  return alert;
}

let vapid: VapidConfig;
beforeAll(async () => {
  vapid = { subject: "mailto:dev@example.com", ...(await generateVapidKeys()) };
});

describe("seat opened on every channel", () => {
  const h = useHarness();

  it("sends one email, one Telegram message and one push for a 0 -> 1 change", async () => {
    let clock = new Date("2026-10-06T18:00:00Z");
    const user = await createUser(h.db, { email: "ana@example.com", telegramChatId: CHAT_ID });
    await createAlert(h.db, user.id, { channels: ["email", "telegram", "push"], at: clock });
    await h.db.insert(pushSubscriptions).values({
      userId: user.id,
      ...(await browserSubscription("https://fcm.googleapis.com/fcm/send/a")),
    });

    const email = createMemoryTransport();
    const telegram = fakeTelegram();
    const push = pushService(() => 201);
    const run = async () => {
      await runPollCycle(
        {
          db: h.db,
          gateway: h.gateway,
          schedule: DEFAULT_SCHEDULE,
          cooldownMs: 30 * MINUTE,
          now: () => clock,
        },
        { maxSubjects: 5, budgetMs: 30_000 },
      );
      await dispatchNotifications(
        {
          db: h.db,
          email,
          telegram: telegram.client,
          vapid,
          pushFetch: push.fetch,
          appUrl: "https://haycupo.example",
          appSecret: "s".repeat(40),
          emailDailyLimit: 90,
          now: () => clock,
        },
        { limit: 30 },
      );
      clock = new Date(clock.getTime() + 61 * MINUTE);
    };

    await run(); // baseline
    h.fake.setAvailable("202620", "D", "78088", 1);
    await run();
    await run(); // still open: no news

    expect(email.sent).toHaveLength(1);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]?.chatId).toBe(CHAT_ID);
    expect(telegram.sent[0]?.html).toContain("<b>NRC <code>78088</code></b>");
    expect(push.requests).toEqual(["https://fcm.googleapis.com/fcm/send/a"]);

    const [metrics] = await h.db.select().from(metricsDaily);
    expect(metrics).toMatchObject({ emailsSent: 1, telegramSent: 1, pushSent: 1 });
  });
});

describe("dispatching to Telegram and push", () => {
  const h = useHarness();
  const at = new Date("2026-10-06T18:00:00Z");

  async function queue(channel: "telegram" | "push", userId: string) {
    const alert = await createAlert(h.db, userId, { channels: [channel], at });
    await h.db.insert(notifications).values({
      alertId: alert.id,
      userId,
      channel,
      createdAt: at,
      nextAttemptAt: at,
      payload: {
        reason: "seat_opened",
        subject: { cycle: "202620", center: "D", code: "I5890", name: "BASES DE DATOS" },
        alert: { id: alert.id, kind: "section", nrc: "78088", filters: {} },
        sections: [],
        detectedAt: at.toISOString(),
      },
    });
  }

  const deps = (overrides: Partial<DispatchDeps>): DispatchDeps => ({
    db: h.db,
    email: null,
    appUrl: "https://haycupo.example",
    appSecret: "s".repeat(40),
    emailDailyLimit: 90,
    now: () => at,
    ...overrides,
  });

  async function statuses() {
    return h.db
      .select({ status: notifications.status, lastError: notifications.lastError })
      .from(notifications);
  }

  it("skips Telegram when the student has not linked a chat", async () => {
    const user = await createUser(h.db, { email: "ana@example.com" });
    await queue("telegram", user.id);
    const telegram = fakeTelegram();

    const summary = await dispatchNotifications(deps({ telegram: telegram.client }), {
      limit: 10,
    });

    expect(summary).toMatchObject({ sent: 0, skipped: 1 });
    expect(await statuses()).toEqual([{ status: "skipped", lastError: "telegram not linked" }]);
  });

  it("unlinks a chat that blocked the bot and does not retry", async () => {
    const user = await createUser(h.db, { email: "ana@example.com", telegramChatId: CHAT_ID });
    await queue("telegram", user.id);
    const blocked = new TelegramError("Forbidden: bot was blocked by the user", 403, true, false);

    const summary = await dispatchNotifications(deps({ telegram: fakeTelegram(blocked).client }), {
      limit: 10,
    });

    expect(summary).toMatchObject({ failed: 1, retrying: 0 });
    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.telegramChatId).toBeNull();
  });

  it("retries Telegram when it is rate limited", async () => {
    const user = await createUser(h.db, { email: "ana@example.com", telegramChatId: CHAT_ID });
    await queue("telegram", user.id);
    const limited = new TelegramError("Too Many Requests", 429, false, true);

    const summary = await dispatchNotifications(deps({ telegram: fakeTelegram(limited).client }), {
      limit: 10,
    });

    expect(summary).toMatchObject({ retrying: 1 });
    expect((await statuses())[0]?.status).toBe("pending");
  });

  it("sends push to every browser and forgets the ones the push service dropped", async () => {
    const user = await createUser(h.db, { email: "ana@example.com" });
    await queue("push", user.id);
    await h.db.insert(pushSubscriptions).values([
      {
        userId: user.id,
        ...(await browserSubscription("https://fcm.googleapis.com/fcm/send/phone")),
      },
      {
        userId: user.id,
        ...(await browserSubscription(
          "https://updates.push.services.mozilla.com/wpush/v2/old-laptop",
        )),
      },
    ]);
    const push = pushService((endpoint) => (endpoint.endsWith("/old-laptop") ? 410 : 201));

    const summary = await dispatchNotifications(deps({ vapid, pushFetch: push.fetch }), {
      limit: 10,
    });

    expect(summary).toMatchObject({ sent: 1 });
    expect(push.requests.sort()).toEqual([
      "https://fcm.googleapis.com/fcm/send/phone",
      "https://updates.push.services.mozilla.com/wpush/v2/old-laptop",
    ]);
    const left = await h.db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions);
    expect(left).toEqual([{ endpoint: "https://fcm.googleapis.com/fcm/send/phone" }]);
  });

  it("never posts to an endpoint that is not a known push service", async () => {
    const user = await createUser(h.db, { email: "ana@example.com" });
    await queue("push", user.id);
    await h.db.insert(pushSubscriptions).values({
      userId: user.id,
      ...(await browserSubscription("https://internal.example/admin")),
    });
    const push = pushService(() => 201);

    const summary = await dispatchNotifications(deps({ vapid, pushFetch: push.fetch }), {
      limit: 10,
    });

    expect(push.requests).toEqual([]);
    expect(summary).toMatchObject({ sent: 0 });
    expect(await h.db.select().from(pushSubscriptions)).toEqual([]);
  });

  it("skips push when the student has no browser subscribed", async () => {
    const user = await createUser(h.db, { email: "ana@example.com" });
    await queue("push", user.id);

    const summary = await dispatchNotifications(deps({ vapid }), { limit: 10 });

    expect(summary).toMatchObject({ skipped: 1 });
  });
});

describe("Telegram bot", () => {
  const h = useHarness();
  const now = new Date("2026-10-06T18:00:00Z");
  const bot = () => ({ db: h.db, appUrl: "https://haycupo.example", now: () => now });

  const message = (text: string, chat: { id?: number; type?: string } = {}) => ({
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: chat.id ?? CHAT_ID, type: chat.type ?? "private" },
      text,
    },
  });

  async function linkCode(userId: string, expiresAt = new Date(now.getTime() + 15 * MINUTE)) {
    const code = "c".repeat(43);
    await h.db
      .insert(telegramLinkTokens)
      .values({ tokenHash: await sha256Hex(code), userId, expiresAt });
    return code;
  }

  it("parses commands, with or without the bot's name", () => {
    expect(parseCommand("/start abc_123")).toEqual({ command: "start", argument: "abc_123" });
    expect(parseCommand("/alertas@HayCupoBot")).toEqual({ command: "alertas", argument: "" });
    expect(parseCommand("hola")).toBeNull();
  });

  it("links a chat with a one-use code", async () => {
    const user = await createUser(h.db, { email: "ana@example.com" });
    const code = await linkCode(user.id);

    const reply = await handleTelegramUpdate(bot(), message(`/start ${code}`));

    expect(reply).toMatchObject({ method: "sendMessage", chat_id: CHAT_ID, parse_mode: "HTML" });
    expect(reply?.text).toContain("¡Listo!");
    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.telegramChatId).toBe(CHAT_ID);

    const again = await handleTelegramUpdate(bot(), message(`/start ${code}`, { id: 777 }));
    expect(again?.text).toContain("ya no sirve");
  });

  it("refuses expired codes", async () => {
    const user = await createUser(h.db, { email: "ana@example.com" });
    const code = await linkCode(user.id, new Date(now.getTime() - MINUTE));

    const reply = await handleTelegramUpdate(bot(), message(`/start ${code}`));

    expect(reply?.text).toContain("ya no sirve");
    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.telegramChatId).toBeNull();
  });

  it("moves a chat to the account that linked it last", async () => {
    await createUser(h.db, { email: "old@example.com", telegramChatId: CHAT_ID });
    const user = await createUser(h.db, { email: "ana@example.com" });

    await handleTelegramUpdate(bot(), message(`/start ${await linkCode(user.id)}`));

    const linked = await h.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.telegramChatId, CHAT_ID));
    expect(linked).toEqual([{ email: "ana@example.com" }]);
  });

  it("lists active alerts and unlinks on request", async () => {
    const user = await createUser(h.db, { email: "ana@example.com", telegramChatId: CHAT_ID });
    await createAlert(h.db, user.id, { channels: ["telegram"], at: now });

    const list = await handleTelegramUpdate(bot(), message("/alertas"));
    expect(list?.text).toContain("1. NRC 78088 de I5890");
    expect(list?.text).toContain('href="https://haycupo.example/alertas"');

    const bye = await handleTelegramUpdate(bot(), message("/desvincular"));
    expect(bye?.text).toContain("ya no te enviaré avisos aquí");
    const after = await handleTelegramUpdate(bot(), message("/alertas"));
    expect(after?.text).toContain("no está conectado");
  });

  it("answers help, ignores groups and non-messages", async () => {
    expect((await handleTelegramUpdate(bot(), message("/start")))?.text).toContain("/alertas");
    expect((await handleTelegramUpdate(bot(), message("hola")))?.text).toContain("/ayuda");
    expect(await handleTelegramUpdate(bot(), message("/alertas", { type: "group" }))).toBeNull();
    expect(await handleTelegramUpdate(bot(), { update_id: 2, edited_message: {} })).toBeNull();
    expect(await handleTelegramUpdate(bot(), "garbage")).toBeNull();
  });

  describe("webhook route", () => {
    const SECRET = "w".repeat(32);
    const handler = (
      config = testConfig({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: SECRET }),
    ) =>
      createHandler({
        db: h.db,
        gateway: h.gateway,
        config,
        email: null,
        telegram: null,
        vapid: null,
      });
    const post = (secret: string | null, body: unknown, config?: ReturnType<typeof testConfig>) =>
      handler(config)(
        new Request("https://worker/telegram/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}),
          },
          body: JSON.stringify(body),
        }),
      );

    it("answers with a sendMessage call when the secret matches", async () => {
      const response = await post(SECRET, message("/ayuda"));

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ method: "sendMessage", chat_id: CHAT_ID });
    });

    it("rejects calls without Telegram's secret", async () => {
      expect((await post(null, message("/ayuda"))).status).toBe(401);
      expect((await post("x".repeat(32), message("/ayuda"))).status).toBe(401);
    });

    it("does not exist when the bot is not configured", async () => {
      expect((await post(SECRET, message("/ayuda"), testConfig())).status).toBe(404);
    });
  });
});

describe("channel configuration", () => {
  it("requires the webhook secret with the bot token, and both VAPID keys", () => {
    expect(() => testConfig({ TELEGRAM_BOT_TOKEN: "123:abc" })).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(() => testConfig({ VAPID_PUBLIC_KEY: "B".repeat(87) })).toThrow(/VAPID_PRIVATE_KEY/);
  });
});
