/**
 * The worker as a plain Node server: local development, end-to-end tests, and plan B if
 * Cloudflare does not work out (a small VM runs exactly this).
 *
 *   pnpm --filter @haycupo/worker dev
 *
 * WORKER_CRON=off disables the built-in one-minute poll loop (end-to-end tests trigger polls
 * with POST /internal/poll instead).
 */
import { fileURLToPath } from "node:url";

import { createDb } from "@haycupo/db";
import { createFileTransport } from "@haycupo/notify/file-transport";

import { createApp, createEmailTransport } from "./app";
import { parseConfig } from "./config";
import { runCycle } from "./jobs";
import { serve } from "./node-server";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = parseConfig(process.env);
const { db, close } = createDb(config.DATABASE_URL, { max: 5 });
const email =
  config.EMAIL_TRANSPORT === "file" && config.EMAIL_FILE_DIR
    ? createFileTransport(config.EMAIL_FILE_DIR)
    : createEmailTransport(config);
const app = createApp(config, db, { email });
const port = Number(process.env.WORKER_PORT ?? 8787);
const server = await serve(app.handle, port, process.env.WORKER_HOST ?? "127.0.0.1");
console.log(`Worker listening on http://127.0.0.1:${String(port)}`);

let running = false;
const tick = () => {
  if (running) return; // never overlap runs
  running = true;
  runCycle(app.context)
    .then((summary) => {
      if (summary.outcomes.length > 0) {
        console.log(
          `poll: ${String(summary.outcomes.length)} subject(s), ${String(summary.dispatched.sent)} sent`,
        );
      }
    })
    .catch((error: unknown) => {
      console.error("Poll run failed", error);
    })
    .finally(() => {
      running = false;
    });
};
const timer = process.env.WORKER_CRON === "off" ? undefined : setInterval(tick, 60_000);

const shutdown = () => {
  clearInterval(timer);
  server.close();
  void close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
