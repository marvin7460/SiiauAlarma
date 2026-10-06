import "server-only";

import { subjects } from "@haycupo/db";
import { normalizeSubjectName } from "@haycupo/siiau";
import { and, asc, eq, or, sql, type AnyColumn } from "drizzle-orm";

import { getDb } from "./db";

export interface SubjectSuggestion {
  code: string;
  name: string;
}

/** `%` and `_` are wildcards in LIKE; a student typing them means the literal character. */
function escapeLike(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/** SQLite's LIKE ignores case for ASCII letters (names are stored without accents). */
function like(column: AnyColumn, pattern: string) {
  return sql`${column} like ${pattern} escape '\\'`;
}

/**
 * Autocomplete from subjects we have already seen in SIIAU results. It never calls SIIAU:
 * typing must not turn into requests to the university.
 */
export async function suggestSubjects(center: string, text: string): Promise<SubjectSuggestion[]> {
  const query = escapeLike(normalizeSubjectName(text));
  if (query.length < 2) return [];
  return getDb()
    .select({ code: subjects.code, name: subjects.name })
    .from(subjects)
    .where(
      and(
        eq(subjects.center, center),
        or(like(subjects.code, `${query}%`), like(subjects.name, `%${query}%`)),
      ),
    )
    .orderBy(
      // Code matches first, then names that start with the text.
      sql`case when ${like(subjects.code, `${query}%`)} then 0
               when ${like(subjects.name, `${query}%`)} then 1 else 2 end`,
      asc(subjects.name),
    )
    .limit(8);
}
