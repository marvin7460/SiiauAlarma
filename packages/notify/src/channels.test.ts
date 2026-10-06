import type { webcrypto } from "node:crypto";

import type { NotificationPayload } from "@haycupo/core";
import { describe, expect, it, vi } from "vitest";

import { buildAlertLinks } from "./links";
import { PushError, isKnownPushService, seatOpenedPush, sendPush } from "./push";
import {
  TelegramError,
  createTelegramClient,
  escapeTelegram,
  formatAlertList,
  offerPublishedTelegram,
  seatOpenedTelegram,
} from "./telegram";
import { generateVapidKeys } from "./vapid-keys";

const PAYLOAD: NotificationPayload = {
  reason: "seat_opened",
  subject: { cycle: "202710", center: "D", code: "I5890", name: "BASES DE DATOS" },
  alert: { id: "alert-1", kind: "section", nrc: "78088", filters: {} },
  sections: [
    {
      nrc: "78088",
      subjectCode: "I5890",
      subjectName: "BASES DE DATOS",
      section: "D02",
      credits: 8,
      capacity: 23,
      available: 1,
      sessions: [
        {
          number: "01",
          start: "13:00",
          end: "14:55",
          days: ["LU", "JU"],
          building: "DUCT1",
          room: "LC03",
          startDate: "2026-08-17",
          endDate: "2026-12-11",
        },
      ],
      professors: [],
    },
  ],
  detectedAt: "2027-01-11T19:05:00Z",
};

const links = () =>
  buildAlertLinks({
    appUrl: "https://haycupo.example",
    secret: "s".repeat(32),
    alertId: "alert-1",
    subject: PAYLOAD.subject,
  });

describe("Telegram messages", () => {
  it("puts the NRC first, in a copyable <code>", async () => {
    const text = seatOpenedTelegram(PAYLOAD, await links());

    expect(text).toContain("<b>¡Hay cupo! I5890 BASES DE DATOS</b>");
    expect(text).toContain("<b>NRC <code>78088</code></b> · Sección D02 · 1 de 23 libres");
    expect(text).toContain("lunes y jueves, 13:00–14:55 · DUCT1 LC03");
    expect(text).toContain("detectado a las 13:05");
    expect(text).toContain('href="https://haycupo.example/alertas/cancelar?');
  });

  it("announces published offers", async () => {
    const text = offerPublishedTelegram(
      { ...PAYLOAD, reason: "offer_published", alert: { ...PAYLOAD.alert, kind: "offer" } },
      await links(),
    );

    expect(text).toContain("Ya publicaron I5890 BASES DE DATOS</b> para 2027A");
    expect(text).toContain("1 secciones, 1 con lugares libres");
  });

  it("escapes HTML", () => {
    expect(escapeTelegram("<b>A & B</b>")).toBe("&lt;b&gt;A &amp; B&lt;/b&gt;");
  });

  it("lists alerts (basic version)", () => {
    expect(formatAlertList([])).toBe("No tienes alertas activas.");
    expect(
      formatAlertList([
        {
          kind: "section",
          nrc: "78088",
          subjectCode: "I5890",
          subjectName: "BASES <DE> DATOS",
          filters: {},
          cycle: "202710",
        },
      ]),
    ).toBe("1. NRC 78088 de I5890 BASES &lt;DE&gt; DATOS");
  });
});

// TODO(Marvin): remove `.skip` when you improve formatAlertList (see telegram.ts).
describe.skip("formatAlertList grouped by cycle", () => {
  it("groups by cycle with bold headers and copyable NRCs", () => {
    expect(
      formatAlertList([
        {
          kind: "section",
          nrc: "78088",
          subjectCode: "I5890",
          subjectName: "BASES DE DATOS",
          filters: {},
          cycle: "202710",
        },
        {
          kind: "subject",
          nrc: null,
          subjectCode: "I5898",
          subjectName: "PROGRAMACION",
          filters: {},
          cycle: "202710",
        },
        {
          kind: "offer",
          nrc: null,
          subjectCode: "I7024",
          subjectName: null,
          filters: {},
          cycle: "202720",
        },
      ]),
    ).toBe(
      [
        "<b>2027A</b>",
        "• NRC <code>78088</code> de I5890 BASES DE DATOS",
        "• Cualquier sección de I5898 PROGRAMACION",
        "",
        "<b>2027B</b>",
        "• Cuando publiquen la oferta de I7024",
      ].join("\n"),
    );
  });
});

describe("createTelegramClient", () => {
  it("calls sendMessage with HTML and no link previews", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ ok: true, result: {} })));
    const client = createTelegramClient({ token: "123:abc", fetch: fetchMock });

    await client.sendMessage(42, "<b>hola</b>");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: 42,
      text: "<b>hola</b>",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  it("recognizes a student who blocked the bot", async () => {
    const client = createTelegramClient({
      token: "t",
      fetch: () =>
        Promise.resolve(
          Response.json(
            { ok: false, description: "Forbidden: bot was blocked by the user" },
            { status: 403 },
          ),
        ),
    });

    const error = await client.sendMessage(1, "x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TelegramError);
    expect(error).toMatchObject({ chatGone: true, retryable: false });
  });
});

// --- Web Push -------------------------------------------------------------------

const encoder = new TextEncoder();

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
}

/** What a browser does with an incoming push (RFC 8291, aes128gcm), to check our encryption. */
async function browserDecrypt(
  body: Uint8Array,
  browser: webcrypto.CryptoKeyPair,
  auth: Uint8Array,
): Promise<string> {
  const view = new DataView(body.buffer, body.byteOffset);
  const salt = body.slice(0, 16);
  const idLength = view.getUint8(20);
  const serverPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);

  const serverKey = await crypto.subtle.importKey(
    "raw",
    serverPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, browser.privateKey, 256),
  );
  const browserPublic = new Uint8Array(await crypto.subtle.exportKey("raw", browser.publicKey));
  const keyInfo = new Uint8Array([
    ...encoder.encode("WebPush: info\0"),
    ...browserPublic,
    ...serverPublic,
  ]);
  const ikm = await hkdf(auth, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, ciphertext),
  );
  let end = padded.length - 1;
  while (end > 0 && padded[end] === 0) end -= 1; // strip padding, then the 0x02 delimiter
  return new TextDecoder().decode(padded.slice(0, end));
}

describe("isKnownPushService", () => {
  it("accepts the push services of real browsers", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:APA91b",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-bl2p.notify.windows.com/w/?token=AwYAAAB",
    ]) {
      expect(isKnownPushService(endpoint), endpoint).toBe(true);
    }
  });

  it("refuses anything else", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://evil.example/fcm.googleapis.com",
      "https://googleapis.com.evil.example/x",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(isKnownPushService(endpoint), endpoint).toBe(false);
    }
  });
});

describe("sendPush", () => {
  async function browserSubscription() {
    const browser = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ]);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const p256dh = toBase64Url(await crypto.subtle.exportKey("raw", browser.publicKey));
    return {
      browser,
      auth,
      subscription: { endpoint: "https://push.example/send/abc", p256dh, auth: toBase64Url(auth) },
    };
  }

  it("sends a message that the browser can decrypt, signed with VAPID", async () => {
    const vapid = { subject: "mailto:dev@example.com", ...(await generateVapidKeys()) };
    const { browser, auth, subscription } = await browserSubscription();
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));
    const data = seatOpenedPush(PAYLOAD, await links());

    await sendPush(subscription, data, vapid, fetchMock);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: Uint8Array },
    ];
    const headers = new Headers(init.headers);
    expect(url).toBe("https://push.example/send/abc");
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("ttl")).toBe("600");
    expect(headers.get("urgency")).toBe("high");
    expect(headers.get("authorization")).toMatch(new RegExp(`^vapid t=.+, k=${vapid.publicKey}$`));
    expect(JSON.parse(await browserDecrypt(init.body, browser, auth))).toEqual(data);
    expect(fromBase64Url(vapid.publicKey)).toHaveLength(65);
  });

  it("flags subscriptions the push service no longer knows", async () => {
    const vapid = { subject: "mailto:dev@example.com", ...(await generateVapidKeys()) };
    const { subscription } = await browserSubscription();

    const error = await sendPush(subscription, seatOpenedPush(PAYLOAD, await links()), vapid, () =>
      Promise.resolve(new Response(null, { status: 410 })),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PushError);
    expect(error).toMatchObject({ gone: true, retryable: false });
  });
});
