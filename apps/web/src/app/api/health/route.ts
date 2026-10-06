import { forwardToEngine } from "@/lib/engine-routes";

/** Public health check, for uptime monitors and Docker's HEALTHCHECK. */
export function GET(request: Request): Promise<Response> {
  return forwardToEngine(request);
}
