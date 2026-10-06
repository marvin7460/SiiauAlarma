import { forwardToEngine } from "@/lib/engine-routes";

/** Telegram calls this with every message to the bot (checked against its secret header). */
export function POST(request: Request): Promise<Response> {
  return forwardToEngine(request);
}
