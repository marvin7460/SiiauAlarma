import { writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import gifenc from "gifenc";
import { PNG } from "pngjs";

import { fakeSiiau, internalPost, makeSubjectsDue, signIn, waitForEmail } from "../../e2e/helpers";

const OUTPUT = path.resolve(import.meta.dirname, "../../../../docs/demo.gif");
const SIZE = { width: 960, height: 640 };

interface Frame {
  png: Buffer;
  delay: number;
}

/** A dark caption pinned to the bottom of the page, like a subtitle. */
async function caption(page: Page, text: string): Promise<void> {
  await page.evaluate((content) => {
    document.getElementById("demo-caption")?.remove();
    const element = document.createElement("div");
    element.id = "demo-caption";
    element.textContent = content;
    Object.assign(element.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      background: "rgba(12, 10, 9, 0.88)",
      color: "white",
      padding: "10px 18px",
      borderRadius: "999px",
      font: "600 17px system-ui, sans-serif",
      zIndex: "9999",
      whiteSpace: "nowrap",
    });
    document.body.append(element);
  }, text);
}

test.use({ viewport: SIZE, colorScheme: "light" });

test("record the demo", async ({ page }) => {
  const frames: Frame[] = [];
  const snap = async (delay: number) => {
    frames.push({ png: await page.screenshot(), delay });
  };

  await signIn(page, "demo@example.com", "/alertas");

  // 1. Search.
  await page.goto("/");
  await caption(page, "Busca tu materia");
  await snap(1500);
  await page.getByLabel("Ciclo").selectOption("202620");
  await page.getByLabel("Centro universitario").selectOption("D");
  const subject = page.getByRole("combobox", { name: "Materia" });
  for (const letter of "I5890") {
    await subject.press(letter);
    await snap(180);
  }
  await page.getByRole("button", { name: "Buscar secciones" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "NRC 78088" });
  await expect(card).toContainText("Sin lugares");
  await card.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await caption(page, "Cada sección, con lugares, horario y profesor");
  await snap(2800);

  // 2. Ask for an alert.
  await card.getByRole("link", { name: "Avísame cuando haya lugar" }).click();
  await expect(page.getByRole("heading", { name: "Nueva alerta" })).toBeVisible();
  await caption(page, "Pide un aviso para ese NRC");
  await snap(2200);
  await page.getByRole("button", { name: "Crear alerta" }).click();
  await expect(page.getByRole("status")).toContainText("te avisaremos");
  await caption(page, "Listo: revisamos SIIAU por ti");
  await snap(2500);

  // 3. Someone drops the class: 0 → 1.
  await internalPost("/poll");
  await fakeSiiau("/__fake/available", {
    cycle: "202620",
    center: "D",
    nrc: "78088",
    available: 1,
  });
  await makeSubjectsDue();
  await internalPost("/poll");
  const email = await waitForEmail("demo@example.com", "¡Hay cupo!");
  await page.setContent(email.html);
  await caption(page, "Alguien la dio de baja: te llega el aviso");
  await snap(4500);

  // DEMO_FRAMES_DIR=… also saves each frame as a PNG, to review them one by one.
  const framesDir = process.env.DEMO_FRAMES_DIR;
  if (framesDir) {
    await Promise.all(
      frames.map((frame, index) =>
        writeFile(path.join(framesDir, `frame-${String(index).padStart(2, "0")}.png`), frame.png),
      ),
    );
  }

  // Encode. Each frame gets its own palette, which keeps text crisp.
  const { GIFEncoder, applyPalette, quantize } = gifenc;
  const gif = GIFEncoder();
  for (const frame of frames) {
    const { data, width, height } = PNG.sync.read(frame.png);
    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.length);
    const palette = quantize(rgba, 128);
    gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: frame.delay });
  }
  gif.finish();
  await writeFile(OUTPUT, gif.bytes());
  console.log(`Wrote ${OUTPUT} (${String(frames.length)} frames)`);
});
