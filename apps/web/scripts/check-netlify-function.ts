/**
 * pnpm --filter @haycupo/web check:netlify   (after `netlify build`)
 *
 * Unpacks the scheduled function exactly as Netlify packaged it and loads it with Node. Catches
 * a bundle that imports something it does not contain (a workspace package left as TypeScript,
 * a missing native module): that would fail on Netlify on every run, silently.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const zip = path.resolve(import.meta.dirname, "../.netlify/functions/poll.zip");
const folder = mkdtempSync(path.join(tmpdir(), "haycupo-poll-"));
try {
  execFileSync("unzip", ["-q", zip, "-d", folder]);
  const entry = path.join(folder, "apps/web/netlify/functions/poll.mjs");
  const fn = (await import(pathToFileURL(entry).href)) as { default: () => Promise<Response> };
  // SCHEDULER_ENABLED=false: the function loads everything, then returns before touching SIIAU.
  Object.assign(process.env, {
    SCHEDULER_ENABLED: "false",
    TURSO_DATABASE_URL: `file:${path.join(folder, "check.db")}`,
    INTERNAL_API_TOKEN: "t".repeat(40),
    APP_SECRET: "s".repeat(40),
    SIIAU_CONTACT_EMAIL: "ci@example.com",
  });
  const body = (await (await fn.default()).json()) as { status: string };
  if (body.status !== "skipped") throw new Error(`Unexpected answer: ${JSON.stringify(body)}`);
  console.log("The packaged scheduled function loads and runs.");
} finally {
  rmSync(folder, { recursive: true, force: true });
}
