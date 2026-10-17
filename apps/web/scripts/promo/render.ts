/**
 * Renders the promo video (scripts/promo/video.html) to an MP4, frame by frame, with its
 * soundtrack (scripts/promo/soundtrack.ts).
 *
 *   pnpm --filter @haycupo/web promo:screens      # once: the real screens, from the app
 *   pnpm --filter @haycupo/web promo:render [--cta "haycupo.me"] [--out video.mp4]
 *   pnpm --filter @haycupo/web promo:render --voice voz.wav   # mixes a narration; the music ducks
 *   pnpm --filter @haycupo/web promo:render --reuse-video     # only redo the audio
 *   pnpm --filter @haycupo/web promo:render --mute            # no audio
 *   pnpm --filter @haycupo/web promo:render --stills 2,9.2,19.6   # PNGs of a few moments
 *
 * Needs ffmpeg on the PATH. Uses PLAYWRIGHT_CHROMIUM_EXECUTABLE when set.
 */
import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { chromium, type Page } from "@playwright/test";

import { writeSoundtrack } from "./soundtrack";

const HERE = import.meta.dirname;
const { values } = parseArgs({
  options: {
    cta: { type: "string", default: "Link en la bio" },
    out: { type: "string", default: path.join(HERE, "out", "haycupo-promo.mp4") },
    fps: { type: "string", default: "30" },
    stills: { type: "string" },
    voice: { type: "string" },
    mute: { type: "boolean", default: false },
    "reuse-video": { type: "boolean", default: false },
  },
});
const fps = Number(values.fps);
const outDir = path.dirname(values.out);
const silentVideo = path.join(outDir, ".video.mp4");

interface PromoWindow {
  ready: Promise<boolean>;
  renderAt: (seconds: number) => void;
  DURATION: number;
}

/** Runs ffmpeg and returns what it printed on stderr. */
function ffmpeg(
  args: string[],
  stdin?: "pipe",
): { process: ReturnType<typeof spawn>; done: Promise<string> } {
  const child = spawn("ffmpeg", ["-y", "-hide_banner", ...args], {
    stdio: [stdin ?? "ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const done = new Promise<string>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with ${String(code)}:\n${stderr.slice(-2000)}`));
    });
  });
  return { process: child, done };
}

async function frameAt(page: Page, seconds: number, type: "jpeg" | "png"): Promise<Buffer> {
  await page.evaluate((t) => {
    (window as unknown as PromoWindow).renderAt(t);
  }, seconds);
  return type === "jpeg" ? page.screenshot({ type, quality: 95 }) : page.screenshot({ type });
}

async function encodeFrames(page: Page, duration: number, out: string): Promise<void> {
  const { process: child, done } = ffmpeg(
    [
      ...["-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg"],
      ...["-framerate", String(fps), "-i", "-"],
      ...["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p"],
      ...["-movflags", "+faststart", out],
    ],
    "pipe",
  );
  const stdin = child.stdin;
  if (!stdin) throw new Error("ffmpeg has no stdin");
  const frames = Math.round(duration * fps);
  for (let index = 0; index < frames; index++) {
    const image = await frameAt(page, index / fps, "jpeg");
    if (!stdin.write(image)) await new Promise((resolve) => stdin.once("drain", resolve));
    if (index % (fps * 5) === 0) console.log(`${String(index / fps)} s`);
  }
  stdin.end();
  await done;
}

async function renderVideo(): Promise<void> {
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

    if (values.stills) {
      for (const moment of values.stills.split(",").map(Number)) {
        const file = path.join(outDir, `still-${moment.toFixed(2)}.png`);
        await writeFile(file, await frameAt(page, moment, "png"));
        console.log(file);
      }
      return;
    }
    await encodeFrames(page, duration, silentVideo);
  } finally {
    await browser.close();
  }
}

/**
 * Mixes the soundtrack (and the narration, if any: the music ducks under it) and brings it to
 * -14 LUFS, what TikTok, Instagram and YouTube play at, with loudnorm's two passes.
 */
async function addAudio(): Promise<void> {
  const music = path.join(outDir, "soundtrack.wav");
  await writeSoundtrack(music);
  const inputs = ["-i", silentVideo, "-i", music, ...(values.voice ? ["-i", values.voice] : [])];
  const mix = values.voice
    ? "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[v1][v2];" +
      "[1:a][v1]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[bed];" +
      "[bed][v2]amix=inputs=2:normalize=0[mix]"
    : "[1:a]anull[mix]";
  const target = "I=-14:TP=-1.5:LRA=11";

  const report = await ffmpeg([
    ...inputs,
    ...["-filter_complex", `${mix};[mix]loudnorm=${target}:print_format=json[a]`],
    ...["-map", "[a]", "-f", "null", "-"],
  ]).done;
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(report)?.[0];
  if (!json) throw new Error("loudnorm printed no measurements");
  const measured = JSON.parse(json) as Record<string, string>;
  const second = [
    target,
    `measured_I=${measured.input_i ?? ""}`,
    `measured_TP=${measured.input_tp ?? ""}`,
    `measured_LRA=${measured.input_lra ?? ""}`,
    `measured_thresh=${measured.input_thresh ?? ""}`,
    `offset=${measured.target_offset ?? ""}`,
    "linear=true",
  ].join(":");

  await ffmpeg([
    ...inputs,
    ...["-filter_complex", `${mix};[mix]loudnorm=${second},aresample=48000[a]`],
    ...["-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k"],
    ...["-shortest", "-movflags", "+faststart", values.out],
  ]).done;
}

await mkdir(outDir, { recursive: true });
if (!values["reuse-video"] || values.stills) await renderVideo();
if (!values.stills) {
  if (values.mute) await copyFile(silentVideo, values.out);
  else await addAudio();
  console.log(`Wrote ${values.out}`);
}
