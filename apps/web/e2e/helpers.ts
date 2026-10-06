import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { createDb } from "@haycupo/db";
import { expect, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";

import { E2E, FAKE_SIIAU_URL, WORKER_URL } from "./env";

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export async function readEmails(): Promise<SentEmail[]> {
  const files = await readdir(E2E.emailDir).catch(() => []);
  const emails = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map(
        async (file) =>
          JSON.parse(await readFile(path.join(E2E.emailDir, file), "utf8")) as SentEmail,
      ),
  );
  return emails;
}

/** Waits for an email to `to` whose subject starts with `subject`. */
export async function waitForEmail(to: string, subject: string): Promise<SentEmail> {
  let found: SentEmail | undefined;
  await expect
    .poll(
      async () => {
        found = (await readEmails()).find(
          (email) => email.to === to && email.subject.startsWith(subject),
        );
        return found !== undefined;
      },
      { timeout: 30_000, message: `email "${subject}" to ${to}` },
    )
    .toBe(true);
  if (!found) throw new Error("unreachable");
  return found;
}

export function firstLink(text: string, pathPrefix: string): string {
  const match = new RegExp(`https?://\\S+${pathPrefix.replaceAll("/", "\\/")}\\S*`).exec(text);
  if (!match) throw new Error(`No ${pathPrefix} link in:\n${text}`);
  return match[0];
}

export async function workerPost(pathname: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${WORKER_URL}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${E2E.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok, `${pathname} answered ${String(response.status)}`).toBe(true);
  return response.json();
}

export async function fakeSiiau(pathname: string, body: unknown): Promise<void> {
  const response = await fetch(`${FAKE_SIIAU_URL}${pathname}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
}

/** Makes every watched subject due now, as if the clock had moved past their next poll. */
export async function makeSubjectsDue(): Promise<void> {
  const { db, close } = createDb(E2E.databaseUrl, { max: 1 });
  try {
    await db.execute(sql`UPDATE watched_subjects SET next_poll_at = now() - interval '1 second'`);
  } finally {
    await close();
  }
}

/** Signs in through the magic link and lands on `next`. */
export async function signIn(page: Page, email: string, next = "/alertas"): Promise<void> {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Tu correo").fill(email);
  await page.getByRole("button", { name: "Enviarme un enlace para entrar" }).click();
  await expect(page.getByRole("status")).toContainText("Revisa tu correo");
  const magic = await waitForEmail(email, "Tu enlace para entrar");
  await page.goto(firstLink(magic.text, "/entrar/confirmar"));
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** Delivers a message to the bot's webhook, as Telegram would, and returns the bot's answer. */
export async function telegramUpdate(chatId: number, text: string): Promise<{ text: string }> {
  const response = await fetch(`${WORKER_URL}/telegram/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": E2E.telegramSecret,
    },
    body: JSON.stringify({
      update_id: Date.now(),
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        from: { id: chatId, is_bot: false, first_name: "Prueba" },
        chat: { id: chatId, type: "private" },
        text,
      },
    }),
  });
  expect(response.ok, `webhook answered ${String(response.status)}`).toBe(true);
  return (await response.json()) as { text: string };
}

/** What the worker sent to a chat through the fake Bot API. */
export async function telegramMessages(chatId: number): Promise<{ text: string }[]> {
  const response = await fetch(`${FAKE_SIIAU_URL}/__telegram/messages`);
  const messages = (await response.json()) as { chatId: number; text: string }[];
  return messages.filter((message) => message.chatId === chatId);
}
