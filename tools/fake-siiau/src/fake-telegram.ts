export interface FakeTelegramMessage {
  chatId: number;
  text: string;
  parseMode: string | null;
}

const BOT_METHOD = /^\/bot([^/]+)\/(\w+)$/;

/**
 * A stand-in for the Telegram Bot API (https://api.telegram.org/bot<token>/<method>), for
 * end-to-end tests: the site points TELEGRAM_API_ORIGIN here and tests read what it "sent"
 * from GET /__telegram/messages.
 */
export class FakeTelegram {
  readonly messages: FakeTelegramMessage[] = [];

  handles(url: URL): boolean {
    return BOT_METHOD.test(url.pathname) || url.pathname.startsWith("/__telegram/");
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__telegram/messages") return Response.json(this.messages);
    if (url.pathname === "/__telegram/reset") {
      this.messages.length = 0;
      return Response.json({ ok: true });
    }
    const method = BOT_METHOD.exec(url.pathname)?.[2];
    if (request.method !== "POST" || !method) {
      return Response.json({ ok: false, description: "Not Found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (method === "sendMessage") {
      this.messages.push({
        chatId: Number(body.chat_id),
        text: String(body.text),
        parseMode: typeof body.parse_mode === "string" ? body.parse_mode : null,
      });
      return Response.json({ ok: true, result: { message_id: this.messages.length } });
    }
    return Response.json({ ok: true, result: true });
  }
}
