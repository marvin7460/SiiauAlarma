import { z } from "zod";

import { suggestSubjects } from "@/lib/subjects";

const QuerySchema = z.object({
  centro: z.string().regex(/^[0-9A-Z]{1,2}$/),
  q: z.string().trim().min(2).max(60),
});

/** Autocomplete for the subject field. Reads our database only; never calls SIIAU. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    centro: url.searchParams.get("centro"),
    q: url.searchParams.get("q"),
  });
  if (!parsed.success) return Response.json([], { status: 400 });

  const suggestions = await suggestSubjects(parsed.data.centro, parsed.data.q);
  return Response.json(suggestions, { headers: { "Cache-Control": "private, max-age=60" } });
}
