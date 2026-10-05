/**
 * The two front doors to the same SIIAU (Oracle PL/SQL) system. See docs/siiau.md §1.
 */
export const SIIAU_BASE_URLS = {
  /** HTTPS, accepts GET and POST. Preferred for everything it serves. */
  current: "https://siiauescolar.siiau.udg.mx/wal/",
  /** HTTP only (asking for HTTPS redirects back to HTTP). Hosts the subject catalog. */
  legacy: "http://consulta.siiau.udg.mx/wco/",
} as const;

export type SiiauHost = keyof typeof SIIAU_BASE_URLS;

export const SIIAU_PAGES = {
  /** Search form: source of the cycle and campus lists. */
  searchForm: "sspseca.forma_consulta",
  /** Search results: one row per section, with seats. */
  offer: "sspseca.consulta_oferta",
  /** Majors offered by a campus (`cup`). */
  majors: "sspseca.lista_carreras",
  /** Subject catalog of a major (legacy host only). */
  catalogByMajor: "scpcata.cataxcarr",
} as const;

const PAGE_NAME = /^[a-z0-9_]+\.[a-z0-9_]+$/i;

/** Builds the URL of a SIIAU page. Parameters are sent as a query string (GET). */
export function buildSiiauUrl(
  host: SiiauHost,
  page: string,
  params: Readonly<Record<string, string>> = {},
): URL {
  if (!PAGE_NAME.test(page)) {
    throw new Error(`Invalid SIIAU page name: "${page}"`);
  }
  const url = new URL(page, SIIAU_BASE_URLS[host]);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
}

export function buildRobotsTxtUrl(host: SiiauHost): URL {
  return new URL("/robots.txt", SIIAU_BASE_URLS[host]);
}
