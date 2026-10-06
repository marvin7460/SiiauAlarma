import { runBatch, siiauOptions, type Database } from "@haycupo/db";
import { buildSearchFormUrl, parseSearchFormResponse } from "@haycupo/siiau";
import { asc } from "drizzle-orm";

import type { OptionsResponse } from "./contract";
import { toApiError } from "./errors";
import type { SiiauGateway } from "./gateway";

export interface OptionsDeps {
  db: Database;
  gateway: SiiauGateway;
  /** Cycles and campuses change a few times a year; refresh once a day. */
  maxAgeMs?: number;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60_000;

/** Cycles and campuses for the search form, read from SIIAU at most once a day. */
export async function getSearchOptions(deps: OptionsDeps): Promise<OptionsResponse> {
  const now = deps.now?.() ?? new Date();
  const rows = await deps.db
    .select()
    .from(siiauOptions)
    .orderBy(asc(siiauOptions.kind), asc(siiauOptions.position));
  const updatedAt = rows.reduce<Date | null>(
    (latest, row) => (latest && latest > row.updatedAt ? latest : row.updatedAt),
    null,
  );
  const fromRows = (stale: boolean): OptionsResponse => ({
    cycles: rows.filter((r) => r.kind === "cycle").map((r) => ({ code: r.code, label: r.label })),
    centers: rows.filter((r) => r.kind === "center").map((r) => ({ code: r.code, name: r.label })),
    updatedAt: (updatedAt ?? now).toISOString(),
    stale,
  });

  if (updatedAt && now.getTime() - updatedAt.getTime() < (deps.maxAgeMs ?? DAY_MS)) {
    return fromRows(false);
  }

  try {
    const url = buildSearchFormUrl();
    const form = await deps.gateway.request("options", url, (response) =>
      parseSearchFormResponse(response, url),
    );
    await runBatch(deps.db, [
      deps.db.delete(siiauOptions),
      deps.db.insert(siiauOptions).values([
        ...form.cycles.map((c, position) => ({
          kind: "cycle" as const,
          code: c.code,
          label: c.label,
          position,
          updatedAt: now,
        })),
        ...form.centers.map((c, position) => ({
          kind: "center" as const,
          code: c.code,
          label: c.name,
          position,
          updatedAt: now,
        })),
      ]),
    ]);
    return { ...form, updatedAt: now.toISOString(), stale: false };
  } catch (error) {
    if (rows.length > 0) return fromRows(true);
    throw toApiError(error);
  }
}
