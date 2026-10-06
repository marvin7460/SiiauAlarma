/*
 * Every table has row-level security enabled and no policies. The app connects as the owner of
 * the tables, which RLS does not restrict; Supabase's Data API (PostgREST, as the anon and
 * authenticated roles) gets nothing, even if someone finds the project's public anon key.
 * See docs/decisions.md (26).
 */
export * from "./accounts";
export * from "./alerts";
export * from "./metrics";
export * from "./siiau";
