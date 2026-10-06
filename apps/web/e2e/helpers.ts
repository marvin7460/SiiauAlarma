import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { createDb } from "@haycupo/db";
import { expect } from "@playwright/test";
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
