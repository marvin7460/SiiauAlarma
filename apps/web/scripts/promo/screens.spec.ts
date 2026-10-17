import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  fakeSiiau,
  internalPost,
  makeSubjectsDue,
  signIn,
  telegramMessages,
  telegramUpdate,
  waitForEmail,
} from "../../e2e/helpers";

/** Where the screens go; render.ts reads them from here. */
const OUT = path.resolve(import.meta.dirname, "out/screens");
const EMAIL = "estudiante@example.com";
const CHAT_ID = 777_001;

// A phone (390 × 844 points at 3×), so the screens are sharp inside the video's phone frame.
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: "light",
});

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function centerOn(page: Page, text: string): Promise<void> {
  const card = page.getByRole("listitem").filter({ hasText: text });
  await card.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
}

test("capture the promo screens", async ({ page }) => {
  await mkdir(OUT, { recursive: true });
  await signIn(page, EMAIL, "/alertas");

  // Telegram linked, so the alert form offers it (Telegram itself is out of reach in tests).
  await page.route("https://t.me/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Telegram</title>" }),
  );
  await page.getByRole("button", { name: "Conectar Telegram" }).click();
  await page.waitForURL((url) => url.hostname === "t.me");
  const code = new URL(page.url()).searchParams.get("start") ?? "";
  await telegramUpdate(CHAT_ID, `/start ${code}`);

  // 1. The search form, filled in.
  await page.goto("/");
  await page.getByLabel("Ciclo").selectOption("202620");
  await page.getByLabel("Centro universitario").selectOption("D");
  await page.getByRole("combobox", { name: "Materia" }).fill("I5890");
  await page.keyboard.press("Escape");
  await shot(page, "1-search");

  // 2. The sections, one of them full.
  await page.goto("/buscar?ciclo=202620&centro=D&materia=I5890");
  const card = page.getByRole("listitem").filter({ hasText: "NRC 78088" });
  await expect(card).toContainText("Sin lugares");
  await centerOn(page, "NRC 78088");
  await shot(page, "2-results");

  // 3. The alert form, with every channel.
  await card.getByRole("link", { name: "Avísame cuando haya lugar" }).click();
  await expect(page.getByRole("heading", { name: "Nueva alerta" })).toBeVisible();
  await expect(page.getByLabel("Telegram")).toBeChecked();
  await shot(page, "3-new-alert");

  // 4. Created.
  await page.getByRole("button", { name: "Crear alerta" }).click();
  await expect(page.getByRole("status")).toContainText("te avisaremos");
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await shot(page, "4-alerts");

  // 5. Someone drops the class: 0 → 1. The real email and Telegram message.
  await internalPost("/poll");
  await fakeSiiau("/__fake/available", {
    cycle: "202620",
    center: "D",
    nrc: "78088",
    available: 1,
  });
  await makeSubjectsDue();
  await internalPost("/poll");
  const email = await waitForEmail(EMAIL, "¡Hay cupo!");
  await page.setContent(email.html);
  await shot(page, "5-email");

  await expect.poll(async () => (await telegramMessages(CHAT_ID)).length).toBeGreaterThan(0);
  const messages = await telegramMessages(CHAT_ID);
  const seat = messages.find((message) => message.text.includes("¡Hay cupo!"));
  await writeFile(
    path.join(OUT, "telegram.json"),
    JSON.stringify({ subject: email.subject, telegram: seat?.text ?? "" }, null, 2),
  );
});
