/**
 * Netlify's scheduler calls this every minute (the schedule is in netlify.toml): it polls at
 * most one due subject (a run may last 30 s; the engine starts no new work after 20 s), sends
 * what that produced and, once an hour, deletes expired data. The same work the in-process
 * scheduler does on a VM.
 *
 * Built into netlify/functions/poll.mjs by `pnpm --filter @haycupo/web build:functions`.
 * Every run costs Netlify credits (they bill the time a function runs), so one subject per
 * run keeps each run short: see docs/deploy.md for what the free plan covers.
 */
import { runScheduledRun } from "@haycupo/engine";

export default async function poll(): Promise<Response> {
  const result = await runScheduledRun(process.env, { budgetMs: 20_000 });
  if (result.status === "ran" && (result.outcomes.length > 0 || result.dispatched.sent > 0)) {
    console.log(
      `poll: ${String(result.outcomes.length)} subject(s), ${String(result.dispatched.sent)} message(s) sent`,
    );
  }
  return Response.json(result);
}
