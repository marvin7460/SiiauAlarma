import { createServer, type IncomingMessage, type Server } from "node:http";

import type { Handler } from "./http";

async function toRequest(message: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const url = `http://${message.headers.host ?? "localhost"}${message.url ?? "/"}`;
  const method = message.method ?? "GET";
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });

  const chunks: Buffer[] = [];
  for await (const chunk of message) chunks.push(chunk as Buffer);
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

/** Serves a fetch-style handler with node:http, so the same routes run outside Cloudflare. */
export function serve(handler: Handler, port: number, hostname = "127.0.0.1"): Promise<Server> {
  const server = createServer((message, reply) => {
    toRequest(message)
      .then(handler)
      .then(async (response) => {
        reply.writeHead(response.status, Object.fromEntries(response.headers));
        reply.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((error: unknown) => {
        console.error("Request failed", error);
        if (!reply.headersSent) reply.writeHead(500);
        reply.end();
      });
  });
  return new Promise((resolve) => {
    server.listen(port, hostname, () => {
      resolve(server);
    });
  });
}
