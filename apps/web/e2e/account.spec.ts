import { createDb, users } from "@haycupo/db";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { DATABASE_URL } from "./env";
import { signIn } from "./helpers";

test("download my data, then delete the account and everything with it", async ({ page }) => {
  const email = `borrar-${String(Date.now())}@example.com`;
  await signIn(page, email, "/alertas");

  const download = await page.request.get("/api/cuenta/datos");
  expect(download.ok()).toBe(true);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  const data = (await download.json()) as { account: { email: string }; alerts: unknown[] };
  expect(data.account.email).toBe(email);
  expect(data.alerts).toEqual([]);

  await page.getByRole("link", { name: "Borrar mi cuenta" }).click();
  await page.getByRole("button", { name: "Sí, borrar mi cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Listo: borramos tu cuenta" })).toBeVisible();

  const { db, close } = createDb({ url: DATABASE_URL });
  try {
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  } finally {
    await close();
  }
  // Signed out: the alerts page asks to sign in again.
  await page.goto("/alertas");
  await expect(page).toHaveURL(/\/entrar\?next=/);
  expect((await page.request.get("/api/cuenta/datos")).status()).toBe(401);
});

test("public pages: status, impact, privacy and about", async ({ page }) => {
  await page.goto("/estado");
  await expect(page.getByRole("heading", { name: "Estado del servicio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Consultas a SIIAU" })).toBeVisible();
  await expect(page.getByText("Activas", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Impacto" }).click();
  await expect(page.getByText("Lugares que se liberaron", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Privacidad" }).click();
  await expect(page.getByRole("heading", { name: "Aviso de privacidad" })).toBeVisible();
  await expect(page.getByRole("main").getByText("No está afiliado")).toBeVisible();

  await page.getByRole("link", { name: "Acerca de" }).click();
  await expect(page.getByRole("heading", { name: "Uso responsable de SIIAU" })).toBeVisible();

  // No cookies for visitors who do not sign in.
  expect(await page.context().cookies()).toEqual([]);
});
