import { z } from "zod";

export interface SubjectQuery {
  cycle: string;
  center: string;
  /** SIIAU searches by code (`crsep`) or by part of the name (`clasep`). */
  kind: "code" | "name";
  value: string;
}

const SearchParamsSchema = z.object({
  ciclo: z.string().regex(/^[0-9A-Z]{4,8}$/),
  centro: z.string().regex(/^[0-9A-Z]{1,2}$/),
  materia: z.string().trim().min(2).max(60),
});

/**
 * Subject codes have letters and digits and no spaces ("I5890", "IL355"); anything else is
 * treated as part of a name ("bases de datos").
 */
export function classifySubject(input: string): Pick<SubjectQuery, "kind" | "value"> {
  const value = input.trim().replace(/\s+/g, " ");
  const looksLikeCode = /^[A-Za-z]{1,3}\d{2,6}[A-Za-z]?$/.test(value);
  return looksLikeCode ? { kind: "code", value: value.toUpperCase() } : { kind: "name", value };
}

type RawParams = Record<string, string | string[] | undefined>;

/** Reads ?ciclo=&centro=&materia= from the URL. Returns null when the search is incomplete. */
export function parseSearchParams(params: RawParams): SubjectQuery | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const result = SearchParamsSchema.safeParse({
    ciclo: first(params.ciclo),
    centro: first(params.centro),
    materia: first(params.materia),
  });
  if (!result.success) return null;
  return {
    cycle: result.data.ciclo,
    center: result.data.centro,
    ...classifySubject(result.data.materia),
  };
}

export function searchHref(query: Pick<SubjectQuery, "cycle" | "center" | "value">): string {
  const params = new URLSearchParams({
    ciclo: query.cycle,
    centro: query.center,
    materia: query.value,
  });
  return `/buscar?${params.toString()}`;
}
