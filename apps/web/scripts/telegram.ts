/**
 * Telegram bot setup and local development.
 *
 *   pnpm --filter @haycupo/web telegram setup https://haycupo.example.com
 *       Points the bot's webhook at the deployed site (/api/telegram/webhook) and registers
 *       the command menu.
 *   pnpm --filter @haycupo/web telegram info
 *       Shows the current webhook and its last error, if any.
 *   pnpm --filter @haycupo/web telegram dev [http://127.0.0.1:3000]
 *       For local development, where Telegram cannot reach your machine: removes the webhook,
 *       reads updates with long polling and forwards them to the local site, exactly as the
 *       webhook would. Run `telegram setup` again when you are done.
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment or .env.local.
 */
import { fileURLToPath } from "node:url";

import { createTelegramClient } from "@haycupo/notify";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (see docs/telegram.md).");
  process.exit(1);
}
const webhookSecret: string = secret;
const telegram = createTelegramClient({ token });
const [command, argument] = process.argv.slice(2);

const COMMANDS = [
  { command: "alertas", description: "Tus alertas activas" },
  { command: "desvincular", description: "Dejar de recibir avisos en este chat" },
  { command: "ayuda", description: "Qué hace este bot" },
];

const WEBHOOK_PATH = "/api/telegram/webhook";

async function setup(siteUrl: string) {
  const url = new URL(WEBHOOK_PATH, siteUrl).href;
  await telegram.call("setWebhook", {
    url,
    secret_token: webhookSecret,
    // Only messages: we ignore everything else, so Telegram need not send it.
    allowed_updates: ["message"],
    drop_pending_updates: true,
    max_connections: 5,
  });
  await telegram.call("setMyCommands", { commands: COMMANDS });
  await telegram.call("setMyDescription", {
    description:
      "Te aviso cuando se libera un lugar en las materias de SIIAU que vigilas. Proyecto independiente, no afiliado a la Universidad de Guadalajara.",
  });
  console.log(`Webhook set to ${url}`);
  await info();
}

async function info() {
  console.log(await telegram.call("getWebhookInfo", {}));
}

interface Update {
  update_id: number;
}

async function dev(siteUrl: string) {
  await telegram.call("deleteWebhook", { drop_pending_updates: false });
  console.log(`Forwarding updates to ${siteUrl} (Ctrl+C to stop)`);
  let offset = 0;
  for (;;) {
    const updates = (await telegram.call("getUpdates", {
      offset,
      timeout: 10, // under the client's 15 s request timeout
      allowed_updates: ["message"],
    })) as Update[];
    for (const update of updates) {
      offset = update.update_id + 1;
      const response = await fetch(new URL(WEBHOOK_PATH, siteUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": webhookSecret,
        },
        body: JSON.stringify(update),
      });
      const reply = (await response.json()) as { method?: string } & Record<string, unknown>;
      console.log(`update ${String(update.update_id)} -> ${String(response.status)}`);
      // What Telegram would do with a webhook answer: run the method it names.
      if (reply.method) {
        const { method, ...body } = reply;
        await telegram.call(method, body);
      }
    }
  }
}

switch (command) {
  case "setup":
    if (!argument) throw new Error("Usage: telegram setup <site URL>");
    await setup(argument);
    break;
  case "info":
    await info();
    break;
  case "dev":
    await dev(argument ?? "http://127.0.0.1:3000");
    break;
  default:
    console.error("Usage: telegram setup <site URL> | info | dev [local site URL]");
    process.exit(1);
}
