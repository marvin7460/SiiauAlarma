/**
 * Runs the fake SIIAU as an HTTP server for local development and end-to-end tests.
 * Point the site at it with SIIAU_ORIGIN_OVERRIDE=http://127.0.0.1:8788.
 * The same server plays the Telegram Bot API (TELEGRAM_API_ORIGIN=http://127.0.0.1:8788).
 *
 *   pnpm --filter @haycupo/fake-siiau start
 */
import { createServer } from "node:http";

import { FakeSiiau } from "./fake-siiau";
import { FakeTelegram } from "./fake-telegram";

const fake = new FakeSiiau();
const telegram = new FakeTelegram();
const port = Number(process.env.FAKE_SIIAU_PORT ?? 8788);

createServer((message, reply) => {
  const chunks: Buffer[] = [];
  message.on("data", (chunk: Buffer) => chunks.push(chunk));
  message.on("end", () => {
    const method = message.method ?? "GET";
    const request = new Request(`http://127.0.0.1:${String(port)}${message.url ?? "/"}`, {
      method,
      headers: { "user-agent": message.headers["user-agent"] ?? "" },
      body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    (telegram.handles(new URL(request.url)) ? telegram : fake)
      .handle(request)
      .then(async (response) => {
        reply.writeHead(response.status, Object.fromEntries(response.headers));
        reply.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((error: unknown) => {
        console.error(error);
        reply.writeHead(500);
        reply.end(String(error));
      });
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Fake SIIAU listening on http://127.0.0.1:${String(port)}`);
});
