import { expect, test } from "@playwright/test";

import { E2E } from "./env";
import {
  fakeSiiau,
  makeSubjectsDue,
  readEmails,
  signIn,
  telegramMessages,
  telegramUpdate,
  internalPost,
} from "./helpers";

const CHAT_ID = 424_242;

test("connect Telegram, then get exactly one Telegram message when a seat opens", async ({
  page,
}) => {
  const email = `telegram-${String(Date.now())}@example.com`;
  await signIn(page, email, "/alertas");

  // 1. "Conectar Telegram" opens t.me/<bot>?start=<code>. Telegram is out of reach in tests,
  //    so we stop at that URL and deliver "/start <code>" to the webhook ourselves.
  await page.route("https://t.me/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Telegram</title>" }),
  );
  await page.getByRole("button", { name: "Conectar Telegram" }).click();
  await page.waitForURL((url) => url.hostname === "t.me");
  const link = new URL(page.url());
  expect(link.pathname).toBe(`/${E2E.telegramBot}`);
  const reply = await telegramUpdate(CHAT_ID, `/start ${link.searchParams.get("start") ?? ""}`);
  expect(reply.text).toContain("¡Listo!");

  await page.goto("/alertas");
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible();

  // 2. An alert on NRC 78120 (0 seats) by Telegram only.
  await page.goto("/buscar?ciclo=202620&centro=D&materia=I5898");
  const card = page.getByRole("listitem").filter({ hasText: "NRC 78120" });
  await card.getByRole("link", { name: "Avísame cuando haya lugar" }).click();
  await expect(page.getByLabel("Telegram")).toBeChecked();
  await page.getByLabel("Correo", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Crear alerta" }).click();
  await expect(page.getByRole("status")).toContainText("te avisaremos");
  await expect(page.getByText("NRC 78120 de I5898 PROGRAMACION")).toBeVisible();

  // 3. Baseline, then 0 → 1.
  await internalPost("/poll");
  await fakeSiiau("/__fake/available", {
    cycle: "202620",
    center: "D",
    nrc: "78120",
    available: 1,
  });
  await makeSubjectsDue();
  await internalPost("/poll");

  await expect.poll(async () => (await telegramMessages(CHAT_ID)).length).toBe(1);
  const [message] = await telegramMessages(CHAT_ID);
  expect(message?.text).toContain("¡Hay cupo! I5898 PROGRAMACION");
  expect(message?.text).toContain("<b>NRC <code>78120</code></b>");
  // Telegram only: no email for this alert.
  const emails = await readEmails();
  expect(emails.filter((sent) => sent.to === email && sent.subject.startsWith("¡Hay"))).toEqual([]);

  // 4. The bot lists the alert, and unlinking shows on the page.
  expect((await telegramUpdate(CHAT_ID, "/alertas")).text).toContain(
    "NRC 78120 de I5898 PROGRAMACION",
  );
  await telegramUpdate(CHAT_ID, "/desvincular");
  await page.goto("/alertas");
  await expect(page.getByRole("button", { name: "Conectar Telegram" })).toBeVisible();
});
