/**
 * The shapes the engine returns (search results, options, errors, health). The site renders
 * them directly; the Zod schemas also validate the public JSON in tests.
 */
import { SectionSchema } from "@haycupo/siiau";
import { z } from "zod";

export const ApiErrorKindSchema = z.enum([
  /** The query is malformed (bad cycle, campus or subject). */
  "invalid_query",
  /** SIIAU did not answer or answered with an error. */
  "siiau_unavailable",
  /** SIIAU answered with a page we do not understand: its HTML probably changed. */
  "siiau_changed",
  /** Too many requests waiting for their turn; try again in a moment. */
  "busy",
  /** Requests to SIIAU are paused (emergency brake, breaker or kill switch). */
  "paused",
  /** robots.txt does not allow the request, or could not be read. */
  "blocked",
  "unauthorized",
  "not_found",
  "internal",
]);
export type ApiErrorKind = z.infer<typeof ApiErrorKindSchema>;

export const ApiProblemSchema = z.object({ kind: ApiErrorKindSchema, message: z.string() });
export type ApiProblem = z.infer<typeof ApiProblemSchema>;

export const ApiErrorResponseSchema = z.object({ error: ApiProblemSchema });

export const SearchKindSchema = z.enum(["code", "name"]);

export const SearchResponseSchema = z.object({
  query: z.object({
    cycle: z.string(),
    center: z.string(),
    kind: SearchKindSchema,
    /** Normalized as sent to SIIAU (uppercase, no accents). */
    value: z.string(),
  }),
  /** When SIIAU produced this data. */
  fetchedAt: z.iso.datetime(),
  /** live: just asked SIIAU; cached: recent enough to reuse; stale: SIIAU failed, older data. */
  freshness: z.enum(["live", "cached", "stale"]),
  totalRecords: z.number().int(),
  sections: z.array(SectionSchema),
  /** Why the data is stale. */
  warning: ApiProblemSchema.optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const OptionsResponseSchema = z.object({
  cycles: z.array(z.object({ code: z.string(), label: z.string() })),
  centers: z.array(z.object({ code: z.string(), name: z.string() })),
  updatedAt: z.iso.datetime(),
  stale: z.boolean(),
});
export type OptionsResponse = z.infer<typeof OptionsResponseSchema>;

/** GET /api/health: public, for uptime checks and Docker's health check. */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  /** False when the kill switch (SIIAU_ENABLED=false) is on. */
  siiauEnabled: z.boolean(),
  /** Whether this server runs the poller every minute. */
  scheduler: z.boolean(),
  channels: z.object({ email: z.boolean(), telegram: z.boolean(), push: z.boolean() }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
