/**
 * Cloudflare Workers entry point. Each invocation opens its own database connection (Workers
 * cannot keep sockets between requests) and closes it once the response is sent.
 */
import { createDb } from "@haycupo/db";

import { createApp } from "./app";
import { parseConfig } from "./config";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const config = parseConfig(env);
    const { db, close } = createDb(config.DATABASE_URL, { max: 1 });
    try {
      return await createApp(config, db).handle(request);
    } finally {
      ctx.waitUntil(close());
    }
  },
} satisfies ExportedHandler<Record<string, unknown>>;
