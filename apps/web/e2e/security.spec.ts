import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/** Everything the browser reports as blocked by the Content-Security-Policy. */
function watchPolicy(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

test("security headers on every page, and nothing the policy blocks", async ({ page }) => {
  const violations = watchPolicy(page);
  const pages = [
    "/",
    "/buscar?ciclo=202620&centro=D&materia=I5890",
    "/entrar",
    "/acerca",
    "/privacidad",
    "/estado",
    "/impacto",
  ];
  for (const path of pages) {
    const headers = (await page.goto(path))?.headers() ?? {};
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    await page.waitForLoadState("networkidle");
  }
  // Signed in: the alerts page, with the Telegram and notification panels.
  await signIn(page, `csp-${String(Date.now())}@example.com`, "/alertas");
  await page.waitForLoadState("networkidle");

  expect(violations).toEqual([]);
});

test("made-up cycles and campuses are refused without asking SIIAU", async ({ page }) => {
  await page.goto("/buscar?ciclo=999999&centro=D&materia=I5890");
  // (Next.js adds its own role="alert" element, the route announcer: look for the text.)
  await expect(page.getByText("Revisa tu búsqueda")).toBeVisible();
});

test("one connection cannot ask for sign-in links for many addresses", async ({ browser }) => {
  // Its own address, so sign-ins in other tests do not count. Without Netlify's header the app
  // reads X-Forwarded-For, which Caddy sets on the VM.
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" },
  });
  const page = await context.newPage();
  const answers: string[] = [];
  for (let i = 0; i < 7; i++) {
    await page.goto("/entrar");
    await page
      .getByLabel("Tu correo")
      .fill(`limite-${String(i)}-${String(Date.now())}@example.com`);
    await page.getByRole("button", { name: "Enviarme un enlace para entrar" }).click();
    const answer = page.getByText(/Te enviamos un enlace|demasiados enlaces/);
    await expect(answer).toBeVisible();
    answers.push((await answer.textContent()) ?? "");
  }
  await context.close();

  expect(answers.slice(0, 6).every((text) => text.includes("Te enviamos un enlace"))).toBe(true);
  expect(answers[6]).toContain("demasiados enlaces");
});
