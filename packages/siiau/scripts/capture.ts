/**
 * Saves real SIIAU responses as test fixtures: the exact bytes plus a .meta.json file.
 *
 *   pnpm capture                         # every case in capture-cases.ts
 *   pnpm capture --only forma-consulta   # comma-separated case ids
 *
 * Responsible use: one request at a time, a pause of SIIAU_MIN_DELAY_MS (≥ 2 s) between
 * them, robots.txt checked first, an identifying User-Agent, and it stops at the first
 * non-2xx answer or network error instead of retrying.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { SIIAU_PAGES, buildRobotsTxtUrl, buildSiiauUrl, type SiiauHost } from "../src/endpoints";
import {
  robotsPolicyFromResponse,
  unreachableRobotsPolicy,
  type RobotsPolicy,
} from "../src/robots";
import { buildUserAgent } from "../src/user-agent";
import { CAPTURE_CASES, type CaptureCase } from "./capture-cases";
import { extractForms } from "../src/html-forms";

const VERSION = "0.1.0";
const FIXTURES_DIR = new URL("../test/fixtures/", import.meta.url);
const ENV_FILE = new URL("../../../.env.local", import.meta.url);
const DEFAULT_DELAY_MS = 3000;
const MIN_ALLOWED_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Response headers worth keeping. Cookies are never stored. */
const KEPT_HEADERS = [
  "content-type",
  "content-length",
  "content-encoding",
  "date",
  "last-modified",
  "cache-control",
  "server",
];

interface FetchResult {
  status: number;
  finalUrl: string;
  redirected: boolean;
  headers: Record<string, string>;
  bytes: Uint8Array;
  durationMs: number;
}

function loadEnvFile(): void {
  try {
    process.loadEnvFile(fileURLToPath(ENV_FILE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function readDelayMs(): number {
  const raw = process.env.SIIAU_MIN_DELAY_MS;
  const delayMs = raw ? Number(raw) : DEFAULT_DELAY_MS;
  if (!Number.isFinite(delayMs) || delayMs < MIN_ALLOWED_DELAY_MS) {
    throw new Error(`SIIAU_MIN_DELAY_MS must be a number ≥ ${MIN_ALLOWED_DELAY_MS}.`);
  }
  return delayMs;
}

/** Sequential fetcher that waits `delayMs` after each response before the next request. */
function createPoliteFetcher(userAgent: string, delayMs: number) {
  let lastFinishedAt: number | undefined;

  return async (url: URL, extraDelayMs = 0): Promise<FetchResult> => {
    if (lastFinishedAt !== undefined) {
      const waitMs = lastFinishedAt + Math.max(delayMs, extraDelayMs) - performance.now();
      if (waitMs > 0) await sleep(waitMs);
    }
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const headers: Record<string, string> = {};
      for (const name of KEPT_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      return {
        status: response.status,
        finalUrl: response.url,
        redirected: response.redirected,
        headers,
        bytes,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      lastFinishedAt = performance.now();
    }
  };
}

type PoliteFetcher = ReturnType<typeof createPoliteFetcher>;

async function saveFixture(
  fileName: string,
  description: string,
  url: URL,
  result: FetchResult,
): Promise<void> {
  const meta = {
    description,
    request: { method: "GET", url: url.href },
    response: {
      status: result.status,
      finalUrl: result.finalUrl,
      redirected: result.redirected,
      headers: result.headers,
    },
    fetchedAt: new Date().toISOString(),
    durationMs: result.durationMs,
    byteLength: result.bytes.byteLength,
    sha256: createHash("sha256").update(result.bytes).digest("hex"),
  };
  const baseName = fileName.replace(/\.[a-z]+$/, "");
  await writeFile(new URL(fileName, FIXTURES_DIR), result.bytes);
  await writeFile(
    new URL(`${baseName}.meta.json`, FIXTURES_DIR),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
}

async function loadRobotsPolicy(
  host: SiiauHost,
  fetchPolitely: PoliteFetcher,
  userAgent: string,
): Promise<RobotsPolicy> {
  const robotsUrl = buildRobotsTxtUrl(host);
  try {
    const result = await fetchPolitely(robotsUrl);
    console.log(`robots.txt (${host}): HTTP ${result.status}`);
    if (result.status >= 200 && result.status < 300) {
      await saveFixture(`robots-${host}.txt`, `robots.txt of the ${host} host.`, robotsUrl, result);
    }
    const body = new TextDecoder("windows-1252").decode(result.bytes);
    return robotsPolicyFromResponse({ robotsUrl, status: result.status, body, userAgent });
  } catch (error) {
    console.error(`robots.txt (${host}) unreachable, skipping that host:`, error);
    return unreachableRobotsPolicy();
  }
}

async function writeFormFields(caseId: string, bytes: Uint8Array): Promise<void> {
  const html = new TextDecoder("windows-1252").decode(bytes);
  const forms = extractForms(html);
  await writeFile(
    new URL(`${caseId}.fields.json`, FIXTURES_DIR),
    `${JSON.stringify(forms, null, 2)}\n`,
  );
  console.log(`  form fields (${caseId}.fields.json):`);
  for (const form of forms) {
    console.log(`    <form action=${form.action ?? "-"} method=${form.method ?? "-"}>`);
    for (const field of form.fields) {
      const kind = field.tag === "input" ? `input[${field.type ?? "text"}]` : field.tag;
      const details = field.tag === "select" ? ` (${field.options.length} options)` : "";
      const value = field.value === null ? "" : ` value=${JSON.stringify(field.value)}`;
      console.log(`      ${kind} name=${field.name ?? "-"}${value}${details}`);
    }
  }
}

function selectCases(only: string | undefined): CaptureCase[] {
  if (!only) return [...CAPTURE_CASES];
  const ids = only.split(",").map((id) => id.trim());
  const unknown = ids.filter((id) => !CAPTURE_CASES.some((c) => c.id === id));
  if (unknown.length > 0) throw new Error(`Unknown case ids: ${unknown.join(", ")}`);
  return CAPTURE_CASES.filter((c) => ids.includes(c.id));
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { only: { type: "string" } } });
  loadEnvFile();
  const userAgent = buildUserAgent({
    version: VERSION,
    contactEmail: process.env.SIIAU_CONTACT_EMAIL ?? "",
  });
  const delayMs = readDelayMs();
  const selected = selectCases(values.only);
  const runnable = selected.filter((c) => !c.todo);
  for (const c of selected.filter((c) => c.todo)) {
    console.warn(`skip ${c.id}: still marked as TODO in capture-cases.ts`);
  }

  await mkdir(FIXTURES_DIR, { recursive: true });
  const fetchPolitely = createPoliteFetcher(userAgent, delayMs);
  console.log(`User-Agent: ${userAgent}\nPause between requests: ${delayMs} ms\n`);

  const policies = new Map<SiiauHost, RobotsPolicy>();
  for (const host of new Set(runnable.map((c) => c.host))) {
    policies.set(host, await loadRobotsPolicy(host, fetchPolitely, userAgent));
  }

  let saved = 0;
  for (const c of runnable) {
    const url = buildSiiauUrl(c.host, c.page, c.params);
    const policy = policies.get(c.host) ?? unreachableRobotsPolicy();
    if (!policy.isAllowed(url)) {
      console.warn(`skip ${c.id}: disallowed by robots.txt (or robots.txt unreachable)`);
      continue;
    }

    let result: FetchResult;
    try {
      result = await fetchPolitely(url, policy.crawlDelayMs);
    } catch (error) {
      console.error(`stop: ${c.id} failed, not retrying.`, error);
      process.exitCode = 1;
      break;
    }
    console.log(
      `${c.id}: HTTP ${result.status}, ${result.bytes.byteLength} bytes, ${result.durationMs} ms`,
    );
    if (result.status < 200 || result.status >= 300) {
      const snippet = new TextDecoder("windows-1252").decode(result.bytes.subarray(0, 300));
      console.error(`stop: not saving, and not insisting. Body starts with:\n${snippet}`);
      process.exitCode = 1;
      break;
    }
    await saveFixture(`${c.id}.html`, c.description, url, result);
    saved += 1;
    if (c.page === SIIAU_PAGES.searchForm) {
      await writeFormFields(c.id, result.bytes);
    }
  }

  console.log(`\nSaved ${saved} fixture(s) in ${fileURLToPath(FIXTURES_DIR)}`);
}

await main();
