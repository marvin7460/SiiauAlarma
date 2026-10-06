/**
 * The worker as a plain Node server: local development, end-to-end tests, and plan B if
 * Cloudflare does not work out (a small VM runs exactly this).
 *
 *   pnpm --filter @haycupo/worker dev
 */
import { fileURLToPath } from "node:url";

import { createDb } from "@haycupo/db";

import { createApp } from "./app";
import { parseConfig } from "./config";
import { serve } from "./node-server";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = parseConfig(process.env);
const { db, close } = createDb(config.DATABASE_URL, { max: 5 });
const app = createApp(config, db);
const port = Number(process.env.WORKER_PORT ?? 8787);
const server = await serve(app.handle, port, process.env.WORKER_HOST ?? "127.0.0.1");
console.log(`Worker listening on http://127.0.0.1:${String(port)}`);

const shutdown = () => {
  server.close();
  void close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
