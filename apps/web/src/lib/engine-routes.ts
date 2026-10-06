import "server-only";

import { getEngine } from "./engine";

/**
 * Hands a request to the engine's routes (packages/engine/src/http.ts), which know them
 * without the /api prefix: health, the Telegram webhook and the operator endpoints.
 */
export function forwardToEngine(request: Request): Promise<Response> {
  return getEngine().handle(request);
}
