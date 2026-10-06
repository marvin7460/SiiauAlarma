/**
 * pnpm --filter @haycupo/web icons
 *
 * Renders src/app/icon.svg (the favicon, which Next serves as is) into the PNG icons that
 * the web app manifest, iOS and Android notifications need. Uses Playwright's Chromium, so
 * no image library is needed. Run it again after changing the SVG, and commit the PNGs.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const svg = await readFile(path.join(root, "src/app/icon.svg"), "utf8");

/**
 * Full-bleed square: Android crops "maskable" icons into its own shape (keeping the central
 * 80% circle) and iOS rounds them, so the bell shrinks a little to stay inside.
 */
const square = svg
  .replace(' rx="112"', "")
  .replace(
    /(<rect[^>]*\/>)([\s\S]*)(<\/svg>)/,
    '$1<g transform="translate(256 256) scale(0.82) translate(-256 -256)">$2</g>$3',
  );
/** Android draws the badge (status bar icon) as a white silhouette; the background must go. */
const badge = svg.replace(/<rect[^>]*\/>/, "").replace(/<circle cx="356"[^>]*\/>/, "");

const outputs = [
  { file: "public/icon-192.png", size: 192, source: svg },
  { file: "public/icon-512.png", size: 512, source: svg },
  { file: "public/icon-maskable-512.png", size: 512, source: square },
  { file: "public/badge-96.png", size: 96, source: badge },
  { file: "src/app/apple-icon.png", size: 180, source: square },
];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {},
);
try {
  for (const output of outputs) {
    const page = await browser.newPage({
      viewport: { width: output.size, height: output.size },
    });
    const sized = output.source.replace(
      "<svg ",
      `<svg width="${String(output.size)}" height="${String(output.size)}" `,
    );
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
    );
    const png = await page.screenshot({ omitBackground: true });
    await writeFile(path.join(root, output.file), png);
    await page.close();
    console.log(`${output.file} (${String(output.size)}px)`);
  }
} finally {
  await browser.close();
}
