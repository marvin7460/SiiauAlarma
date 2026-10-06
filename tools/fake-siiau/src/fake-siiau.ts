import {
  normalizeSubjectName,
  type SearchForm,
  type Section,
  type SiiauFetcher,
} from "@haycupo/siiau";
import { encodeLatin1, renderOfferPage, renderSearchForm } from "@haycupo/siiau/testing";

import { SEED_FORM, seedOffers } from "./seed";

export interface FakeRequest {
  path: string;
  userAgent: string | null;
  at: number;
}

const HTML = { "Content-Type": "text/html; charset=ISO-8859-1" };

function htmlResponse(html: string): Response {
  return new Response(encodeLatin1(html), { headers: HTML });
}

/**
 * An in-memory SIIAU. Tests change seats with `setAvailable` (or POST /__fake/available when it
 * runs as a server) and check what the app requested with `requests`.
 */
export class FakeSiiau {
  readonly requests: FakeRequest[] = [];
  robotsTxt = "User-agent: *\nDisallow:\n";
  form: SearchForm = SEED_FORM;
  offers: Map<string, Section[]> = seedOffers();
  private failures: { status: number; remaining: number } | null = null;

  /** Answer the next `count` SIIAU pages with `status` (to test the breaker and error pages). */
  failNext(status: number, count = 1): void {
    this.failures = { status, remaining: count };
  }

  setAvailable(cycle: string, center: string, nrc: string, available: number): void {
    const section = this.offers.get(`${cycle}|${center}`)?.find((s) => s.nrc === nrc);
    if (!section) throw new Error(`No section ${nrc} in ${cycle}|${center}`);
    section.available = available;
  }

  reset(): void {
    this.requests.length = 0;
    this.robotsTxt = "User-agent: *\nDisallow:\n";
    this.form = SEED_FORM;
    this.offers = seedOffers();
    this.failures = null;
  }

  /** Pages a real SIIAU serves, plus /__fake/* control endpoints for out-of-process tests. */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__fake/")) return this.control(request, url);

    this.requests.push({
      path: url.pathname + url.search,
      userAgent: request.headers.get("user-agent"),
      at: Date.now(),
    });
    if (url.pathname === "/robots.txt") {
      return new Response(this.robotsTxt, { headers: { "Content-Type": "text/plain" } });
    }
    if (this.failures && this.failures.remaining > 0) {
      this.failures.remaining -= 1;
      return new Response("Servicio no disponible", { status: this.failures.status });
    }
    switch (url.pathname) {
      case "/wal/sspseca.forma_consulta":
        return htmlResponse(renderSearchForm(this.form));
      case "/wal/sspseca.consulta_oferta":
        return htmlResponse(renderOfferPage(this.search(url.searchParams)));
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private search(params: URLSearchParams): Section[] {
    const sections =
      this.offers.get(`${params.get("ciclop") ?? ""}|${params.get("cup") ?? ""}`) ?? [];
    const code = params.get("crsep");
    const name = params.get("clasep");
    if (code) return sections.filter((section) => section.subjectCode === code);
    if (name) {
      const wanted = normalizeSubjectName(name);
      return sections.filter((section) => section.subjectName.includes(wanted));
    }
    return sections;
  }

  private async control(request: Request, url: URL): Promise<Response> {
    if (request.method === "GET" && url.pathname === "/__fake/requests") {
      return Response.json(this.requests);
    }
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    switch (url.pathname) {
      case "/__fake/available":
        this.setAvailable(
          String(body.cycle),
          String(body.center),
          String(body.nrc),
          Number(body.available),
        );
        return Response.json({ ok: true });
      case "/__fake/fail":
        this.failNext(Number(body.status ?? 503), Number(body.count ?? 1));
        return Response.json({ ok: true });
      case "/__fake/reset":
        this.reset();
        return Response.json({ ok: true });
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  /** A fetcher that calls this fake in-process, without opening a port. */
  fetcher(): SiiauFetcher {
    return async (url) => {
      const response = await this.handle(new Request(url, { headers: { "User-Agent": "test" } }));
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    };
  }
}
