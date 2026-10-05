/**
 * One-off check before choosing Cloudflare Workers for the poller: does SIIAU answer
 * requests that leave from Cloudflare's network, over both hosts, and can the runtime
 * decode ISO-8859-1? Deploy, open it once, copy the JSON, then delete the Worker.
 *
 * It makes 5 requests, one at a time, 3 s apart, and checks robots.txt first.
 */
import {
  SIIAU_PAGES,
  buildRobotsTxtUrl,
  buildSiiauUrl,
  buildUserAgent,
  robotsPolicyFromResponse,
  unreachableRobotsPolicy,
  type SiiauHost,
} from "@haycupo/siiau";

interface Env {
  PROBE_KEY?: string;
  SIIAU_CONTACT_EMAIL?: string;
}

interface ProbeResult {
  url: string;
  status?: number;
  finalUrl?: string;
  redirected?: boolean;
  ms: number;
  bytes?: number;
  contentType?: string | null;
  title?: string | null;
  error?: string;
  skipped?: string;
}

const PAUSE_MS = 3000;
const HOSTS: readonly SiiauHost[] = ["current", "legacy"];
const PAGES: readonly { host: SiiauHost; url: URL }[] = [
  { host: "current", url: buildSiiauUrl("current", SIIAU_PAGES.searchForm) },
  {
    host: "current",
    url: buildSiiauUrl("current", SIIAU_PAGES.offer, {
      ciclop: "202620",
      cup: "D",
      crsep: "I5890",
      mostrarp: "500",
    }),
  },
  { host: "legacy", url: buildSiiauUrl("legacy", SIIAU_PAGES.searchForm) },
];

function decodeLatin1(bytes: Uint8Array): string {
  let text = "";
  for (let start = 0; start < bytes.length; start += 8192) {
    text += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return text;
}

function supportsEncoding(label: string): boolean {
  try {
    return new TextDecoder(label).decode(new Uint8Array([0xd1])) === "Ñ";
  } catch {
    return false;
  }
}

async function probe(url: URL, userAgent: string): Promise<{ result: ProbeResult; text: string }> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = decodeLatin1(bytes);
    const result: ProbeResult = {
      url: url.href,
      status: response.status,
      finalUrl: response.url,
      redirected: response.redirected,
      ms: Date.now() - startedAt,
      bytes: bytes.byteLength,
      contentType: response.headers.get("content-type"),
      title: /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() ?? null,
    };
    return { result, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: { url: url.href, ms: Date.now() - startedAt, error: message }, text: "" };
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const key = new URL(request.url).searchParams.get("key");
    if (!env.PROBE_KEY || key !== env.PROBE_KEY) {
      return new Response("Not found", { status: 404 });
    }
    const userAgent = buildUserAgent({
      version: "0.1.0-probe",
      contactEmail: env.SIIAU_CONTACT_EMAIL ?? "",
    });

    const results: ProbeResult[] = [];
    let requestsMade = 0;
    const fetchPolitely = async (url: URL) => {
      if (requestsMade > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      requestsMade += 1;
      return probe(url, userAgent);
    };

    for (const host of HOSTS) {
      const robotsUrl = buildRobotsTxtUrl(host);
      const robots = await fetchPolitely(robotsUrl);
      results.push(robots.result);
      const policy =
        robots.result.status === undefined
          ? unreachableRobotsPolicy()
          : robotsPolicyFromResponse({
              robotsUrl,
              status: robots.result.status,
              body: robots.text,
              userAgent,
            });

      for (const page of PAGES.filter((p) => p.host === host)) {
        if (!policy.isAllowed(page.url)) {
          results.push({ url: page.url.href, ms: 0, skipped: "disallowed by robots.txt" });
          continue;
        }
        results.push((await fetchPolitely(page.url)).result);
      }
    }

    return Response.json(
      {
        colo: request.cf?.colo,
        country: request.cf?.country,
        userAgent,
        textDecoder: {
          "windows-1252": supportsEncoding("windows-1252"),
          "iso-8859-1": supportsEncoding("iso-8859-1"),
        },
        results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
} satisfies ExportedHandler<Env>;
