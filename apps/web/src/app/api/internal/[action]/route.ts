import { forwardToEngine } from "@/lib/engine-routes";

/**
 * Operator endpoints, protected by INTERNAL_API_TOKEN: `poll` (run a cycle now), `dispatch`
 * (send pending messages) and `brake` (pause or resume every request to SIIAU).
 */
export function POST(request: Request): Promise<Response> {
  return forwardToEngine(request);
}
