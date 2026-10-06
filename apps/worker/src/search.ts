import { offerSnapshots, subjects, type Database } from "@haycupo/db";
import { buildOfferUrl, parseOfferResponse, type OfferPage, type OfferQuery } from "@haycupo/siiau";
import { and, eq, sql } from "drizzle-orm";

import type { SearchResponse } from "./contract";
import { toApiError, toProblem } from "./errors";
import type { RequestPurpose, SiiauGateway } from "./gateway";

export interface SearchDeps {
  db: Database;
  gateway: SiiauGateway;
  /** How long a stored result is reused before asking SIIAU again. */
  cacheTtlMs: number;
  now?: () => Date;
}

export interface SearchInput {
  cycle: string;
  center: string;
  kind: "code" | "name";
  value: string;
}

interface SnapshotKey {
  cycle: string;
  center: string;
  queryKind: "code" | "name";
  queryValue: string;
}

function keyCondition(key: SnapshotKey) {
  return and(
    eq(offerSnapshots.cycle, key.cycle),
    eq(offerSnapshots.center, key.center),
    eq(offerSnapshots.queryKind, key.queryKind),
    eq(offerSnapshots.queryValue, key.queryValue),
  );
}

/** Validates and normalizes the input exactly as it will be sent to SIIAU. */
export function resolveQuery(input: SearchInput): { url: URL; key: SnapshotKey } {
  const query: OfferQuery =
    input.kind === "code"
      ? { cycle: input.cycle, center: input.center, subjectCode: input.value }
      : { cycle: input.cycle, center: input.center, subjectName: input.value };
  const url = buildOfferUrl(query); // throws InvalidQueryError
  const queryValue = url.searchParams.get(input.kind === "code" ? "crsep" : "clasep") ?? "";
  return {
    url,
    key: { cycle: input.cycle, center: input.center, queryKind: input.kind, queryValue },
  };
}

/**
 * Asks SIIAU (through the gateway) and stores the result for everyone: the snapshot for the
 * next searches, and the subjects for autocomplete. Used by searches and by the poller.
 */
export async function fetchAndStoreOffer(
  deps: Pick<SearchDeps, "db" | "gateway" | "now">,
  url: URL,
  key: SnapshotKey,
  purpose: RequestPurpose,
): Promise<{ page: OfferPage; fetchedAt: Date }> {
  const page = await deps.gateway.request(purpose, url, (response) =>
    parseOfferResponse(response, url),
  );
  const fetchedAt = deps.now?.() ?? new Date();
  await deps.db
    .insert(offerSnapshots)
    .values({
      ...key,
      fetchedAt,
      totalRecords: page.totalRecords,
      sections: page.sections,
      lastError: null,
      lastErrorAt: null,
    })
    .onConflictDoUpdate({
      target: [
        offerSnapshots.cycle,
        offerSnapshots.center,
        offerSnapshots.queryKind,
        offerSnapshots.queryValue,
      ],
      set: {
        fetchedAt,
        totalRecords: page.totalRecords,
        sections: page.sections,
        lastError: null,
        lastErrorAt: null,
      },
    });

  const seen = new Map(page.sections.map((s) => [s.subjectCode, s.subjectName]));
  if (seen.size > 0) {
    await deps.db
      .insert(subjects)
      .values(
        [...seen].map(([code, name]) => ({
          center: key.center,
          code,
          name,
          lastSeenCycle: key.cycle,
        })),
      )
      .onConflictDoUpdate({
        target: [subjects.center, subjects.code],
        set: {
          name: sql`excluded.name`,
          lastSeenCycle: sql`excluded.last_seen_cycle`,
          updatedAt: sql`now()`,
        },
      });
  }
  return { page, fetchedAt };
}

/**
 * A search from the web: reuses a recent result when there is one; otherwise asks SIIAU. If
 * SIIAU fails and an older result exists, returns it marked "stale" with the reason.
 */
export async function searchOffer(deps: SearchDeps, input: SearchInput): Promise<SearchResponse> {
  let resolved: ReturnType<typeof resolveQuery>;
  try {
    resolved = resolveQuery(input);
  } catch (error) {
    throw toApiError(error);
  }
  const { url, key } = resolved;
  const now = deps.now?.() ?? new Date();
  const [cached] = await deps.db.select().from(offerSnapshots).where(keyCondition(key));
  const query = {
    cycle: key.cycle,
    center: key.center,
    kind: key.queryKind,
    value: key.queryValue,
  };

  if (
    cached?.fetchedAt &&
    cached.sections &&
    now.getTime() - cached.fetchedAt.getTime() < deps.cacheTtlMs
  ) {
    return {
      query,
      fetchedAt: cached.fetchedAt.toISOString(),
      freshness: "cached",
      totalRecords: cached.totalRecords ?? cached.sections.length,
      sections: cached.sections,
    };
  }

  try {
    const { page, fetchedAt } = await fetchAndStoreOffer(deps, url, key, "search");
    return {
      query,
      fetchedAt: fetchedAt.toISOString(),
      freshness: "live",
      totalRecords: page.totalRecords,
      sections: page.sections,
    };
  } catch (error) {
    const problem = toProblem(error);
    if (problem.kind === "internal") throw error;
    if (problem.kind !== "invalid_query") {
      await deps.db
        .insert(offerSnapshots)
        .values({ ...key, lastError: `${problem.kind}: ${problem.message}`, lastErrorAt: now })
        .onConflictDoUpdate({
          target: [
            offerSnapshots.cycle,
            offerSnapshots.center,
            offerSnapshots.queryKind,
            offerSnapshots.queryValue,
          ],
          set: { lastError: `${problem.kind}: ${problem.message}`, lastErrorAt: now },
        });
    }
    if (cached?.fetchedAt && cached.sections) {
      return {
        query,
        fetchedAt: cached.fetchedAt.toISOString(),
        freshness: "stale",
        totalRecords: cached.totalRecords ?? cached.sections.length,
        sections: cached.sections,
        warning: problem,
      };
    }
    throw toApiError(error);
  }
}
