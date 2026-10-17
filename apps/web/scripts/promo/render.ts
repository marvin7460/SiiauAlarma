/**
 * Renders the promo video (scripts/promo/video.html) to an MP4, frame by frame.
 *
 *   pnpm --filter @haycupo/web promo:screens      # once: the real screens, from the app
 *   pnpm --filter @haycupo/web promo:render [--cta "haycupo.me"] [--out video.mp4]
 *   pnpm --filter @haycupo/web promo:render --stills 2,9.2,19.6   # PNGs of a few moments
 *
 * Needs ffmpeg on the PATH. Uses PLAYWRIGHT_CHROMIUM_EXECUTABLE when set.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { chromium, type Page } from "@playwright/test";

const HERE = import.meta.dirname;
const { values } = parseArgs({
  options: {
    cta: { type: "string", default: "Link en la bio" },
    out: { type: "string", default: path.join(HERE, "out", "haycupo-promo.mp4") },
    fps: { type: "string", default: "30" },
    stills: { type: "string" },
  },
});
const fps = Number(values.fps);

interface PromoWindow {
  ready: Promise<boolean>;
  renderAt: (seconds: number) => void;
  DURATION: number;
}

async function frameAt(page: Page, seconds: number, type: "jpeg" | "png"): Promise<Buffer> {
  await page.evaluate((t) => {
    (window as unknown as PromoWindow).renderAt(t);
  }, seconds);
  return type === "jpeg" ? page.screenshot({ type, quality: 95 }) : page.screenshot({ type });
}

async function encode(page: Page, duration: number, out: string): Promise<void> {
  const ffmpeg = spawn(
    "ffmpeg",
    [
      ...["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg"],
      ...["-framerate", String(fps), "-i", "-"],
      ...["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p"],
      ...["-movflags", "+faststart", out],
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise<void>((resolve, reject) => {
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${String(code)}`));
    });
  });

  const frames = Math.round(duration * fps);
  for (let index = 0; index < frames; index++) {
    const image = await frameAt(page, index / fps, "jpeg");
    if (!ffmpeg.stdin.write(image)) {
      await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
    }
    if (index % (fps * 5) === 0) console.log(`${String(index / fps)} s`);
  }
  ffmpeg.stdin.end();
  await done;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const url = pathToFileURL(path.join(HERE, "video.html"));
  url.searchParams.set("cta", values.cta);
  await page.goto(url.href);
  const duration = await page.evaluate(async () => {
    const promo = window as unknown as PromoWindow;
    await promo.ready;
    await document.fonts.load('800 100px "Inter"');
    return promo.DURATION;
  });

  await mkdir(path.dirname(values.out), { recursive: true });
  if (values.stills) {
    for (const moment of values.stills.split(",").map(Number)) {
      const file = path.join(path.dirname(values.out), `still-${moment.toFixed(2)}.png`);
      await writeFile(file, await frameAt(page, moment, "png"));
      console.log(file);
    }
  } else {
    await encode(page, duration, values.out);
    console.log(`Wrote ${values.out}`);
  }
} finally {
  await browser.close();
}
