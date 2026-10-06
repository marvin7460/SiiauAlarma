import { decodeSiiauBody } from "./encoding";
import { SIIAU_PAGES, buildSiiauUrl } from "./endpoints";
import { SiiauHttpError, SiiauIncompleteResultsError } from "./errors";
import type { OfferPage, SearchForm } from "./model";
import { parseOfferPage } from "./offer";
import { parseSearchForm } from "./search-form";

export interface SiiauResponse {
  status: number;
  contentType: string | null;
  bytes: Uint8Array;
}

/**
 * How the client talks to the network. Production wraps `fetch` with the global rate limit
 * (one request at a time, a pause between them); tests pass a fake that serves fixtures.
 */
export type SiiauFetcher = (url: URL) => Promise<SiiauResponse>;

export const PAGE_SIZES = [100, 200, 500] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface OfferQuery {
  /** `ciclop`, e.g. "202620". */
  cycle: string;
  /** `cup`, e.g. "D". */
  center: string;
  /** `crsep`, e.g. "I5890". Either this or `subjectName`. */
  subjectCode?: string;
  /** `clasep`: part of the subject name, e.g. "BASES DE DATOS". */
  subjectName?: string;
  /** `mostrarp`. One subject never has 500 sections, so the default fits in one page. */
  pageSize?: PageSize;
}

const CYCLE = /^[0-9A-Z]{4,8}$/;
const CENTER = /^[0-9A-Z]{1,2}$/;
const SUBJECT_CODE = /^[A-Z0-9]{2,10}$/;
const SUBJECT_NAME = /^[A-Z0-9Ñ .,-]{3,60}$/;

/** "  i5890 " → "I5890". */
export function normalizeSubjectCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** SIIAU stores names in uppercase, almost always without accents: "Diseño básico" → "DISEÑO BASICO". */
export function normalizeSubjectName(input: string): string {
  return (
    input
      .toUpperCase()
      .normalize("NFD")
      // Drop accents, but keep the tilde of Ñ (N + U+0303 after NFD).
      .replace(/(?<!N)̃|[̀-̂̄-ͯ]/g, "")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export class InvalidQueryError extends Error {
  override name = "InvalidQueryError";
}

/** Validates the query before it reaches SIIAU, so user input never builds odd URLs. */
export function buildOfferUrl(query: OfferQuery): URL {
  if (!CYCLE.test(query.cycle)) throw new InvalidQueryError(`Invalid cycle: ${query.cycle}`);
  if (!CENTER.test(query.center)) throw new InvalidQueryError(`Invalid campus: ${query.center}`);
  const params: Record<string, string> = { ciclop: query.cycle, cup: query.center };
  if (query.subjectCode !== undefined) {
    const code = normalizeSubjectCode(query.subjectCode);
    if (!SUBJECT_CODE.test(code)) throw new InvalidQueryError(`Invalid subject code: ${code}`);
    params.crsep = code;
  } else if (query.subjectName !== undefined) {
    const name = normalizeSubjectName(query.subjectName);
    if (!SUBJECT_NAME.test(name)) throw new InvalidQueryError(`Invalid subject name: ${name}`);
    params.clasep = name;
  } else {
    throw new InvalidQueryError("A subject code or name is required");
  }
  params.mostrarp = String(query.pageSize ?? 500);
  return buildSiiauUrl("current", SIIAU_PAGES.offer, params);
}

export function buildSearchFormUrl(): URL {
  return buildSiiauUrl("current", SIIAU_PAGES.searchForm);
}

function responseHtml(response: SiiauResponse, url: URL): string {
  if (response.status !== 200) throw new SiiauHttpError(response.status, url.href);
  return decodeSiiauBody(response.bytes, response.contentType);
}

/**
 * Decodes and parses the answer to `buildOfferUrl(query)`. Separate from the request so the
 * caller decides how the request is made (the gateway takes turns and records the outcome).
 */
export function parseOfferResponse(response: SiiauResponse, url: URL): OfferPage {
  const page = parseOfferPage(responseHtml(response, url));
  if (page.sections.length !== page.totalRecords) {
    throw new SiiauIncompleteResultsError(page.totalRecords, page.sections.length);
  }
  return page;
}

export function parseSearchFormResponse(response: SiiauResponse, url: URL): SearchForm {
  return parseSearchForm(responseHtml(response, url));
}

/** All sections of a subject (or of the subjects matching a name) in one cycle and campus. */
export async function fetchOffer(fetcher: SiiauFetcher, query: OfferQuery): Promise<OfferPage> {
  const url = buildOfferUrl(query);
  return parseOfferResponse(await fetcher(url), url);
}

export async function fetchSearchForm(fetcher: SiiauFetcher): Promise<SearchForm> {
  const url = buildSearchFormUrl();
  return parseSearchFormResponse(await fetcher(url), url);
}

export interface HttpFetcherOptions {
  userAgent: string;
  timeoutMs?: number;
}

/**
 * Plain `fetch` with our User-Agent and a timeout. It does NOT rate-limit: wrap it with the
 * gateway before pointing it at SIIAU.
 */
export function createHttpFetcher({
  userAgent,
  timeoutMs = 20_000,
}: HttpFetcherOptions): SiiauFetcher {
  return async (url) => {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  };
}
