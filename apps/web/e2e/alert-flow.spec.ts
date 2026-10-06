import { expect, test } from "@playwright/test";

import {
  fakeSiiau,
  firstLink,
  makeSubjectsDue,
  readEmails,
  waitForEmail,
  internalPost,
} from "./helpers";

test("search, ask for an alert, get exactly one email when a seat opens, cancel it", async ({
  page,
}) => {
  const email = `estudiante-${String(Date.now())}@example.com`;

  // 1. Search I5890 in 2026B at CUCEI.
  await page.goto("/");
  await page.getByLabel("Ciclo").selectOption("202620");
  await page.getByLabel("Centro universitario").selectOption("D");
  await page.getByRole("combobox", { name: "Materia" }).fill("I5890");
  await page.getByRole("button", { name: "Buscar secciones" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "NRC 78088" });
  await expect(card).toContainText("Sin lugares");

  // 2. Ask for an alert on NRC 78088: we are not signed in, so the page asks for an email.
  await card.getByRole("link", { name: "Avísame cuando haya lugar" }).click();
  await expect(page.getByRole("heading", { name: /entra con tu correo/ })).toBeVisible();
  await page.getByLabel("Tu correo").fill(email);
  await page.getByRole("button", { name: "Enviarme un enlace para entrar" }).click();
  await expect(page.getByRole("status")).toContainText("Revisa tu correo");

  // 3. Open the magic link, confirm, and land back on the alert form.
  const magic = await waitForEmail(email, "Tu enlace para entrar");
  await page.goto(firstLink(magic.text, "/entrar/confirmar"));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Nueva alerta" })).toBeVisible();
  await page.getByRole("button", { name: "Crear alerta" }).click();
  await expect(page.getByRole("status")).toContainText("te avisaremos");
  await expect(page.getByText("NRC 78088 de I5890 BASES DE DATOS")).toBeVisible();

  // 4. First poll: the baseline (0 seats). Nothing to tell.
  await internalPost("/poll");
  expect((await readEmails()).filter((sent) => sent.subject.startsWith("¡Hay cupo!"))).toEqual([]);

  // 5. Someone drops the class: 0 → 1. The next poll sends exactly one email.
  await fakeSiiau("/__fake/available", {
    cycle: "202620",
    center: "D",
    nrc: "78088",
    available: 1,
  });
  await makeSubjectsDue();
  await internalPost("/poll");
  const alert = await waitForEmail(email, "¡Hay cupo! I5890 BASES DE DATOS · NRC 78088");
  expect(alert.text).toContain("1 de 23 lugares libres");
  expect(alert.headers?.["List-Unsubscribe"]).toContain("/api/alertas/cancelar");

  // Still open on the next poll: not news.
  await makeSubjectsDue();
  await internalPost("/poll");
  const seatEmails = (await readEmails()).filter(
    (sent) => sent.to === email && sent.subject.startsWith("¡Hay cupo!"),
  );
  expect(seatEmails).toHaveLength(1);

  // 6. Cancel from the link in the email.
  await page.goto(firstLink(alert.text, "/alertas/cancelar"));
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByRole("status")).toContainText("ya no te avisaremos");
  await page.goto("/alertas");
  await expect(page.getByText("Cancelada")).toBeVisible();
});

test("says clearly when SIIAU is down instead of showing an empty result", async ({ page }) => {
  await fakeSiiau("/__fake/fail", { status: 503, count: 1 });

  await page.goto("/buscar?ciclo=202620&centro=D&materia=I5898");

  // Next.js also renders an (empty) role="alert" route announcer, so filter by text.
  await expect(
    page.getByRole("alert").filter({ hasText: "SIIAU no está respondiendo" }),
  ).toBeVisible();
});

test("offers an 'tell me when it is published' alert for an unpublished cycle", async ({
  page,
}) => {
  await page.goto("/buscar?ciclo=202710&centro=D&materia=I5890");

  await expect(page.getByText("SIIAU no tiene secciones de")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Avísame cuando publiquen esta materia" }),
  ).toBeVisible();
});
