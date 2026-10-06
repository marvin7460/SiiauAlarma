# SIIAU fixtures

Real responses from SIIAU's public course offering, saved by `pnpm capture`
(see `scripts/capture.ts` and the case list in `scripts/capture-cases.ts`).

For each case there is:

- `<case>.html` (or `.txt` for robots.txt): the exact bytes SIIAU sent. They are
  ISO-8859-1, so `.gitattributes` marks this folder `-text`: Git must never
  re-encode them or touch their line endings. Never edit them by hand.
- `<case>.meta.json`: request URL, date, status, a few response headers (never
  cookies), size and SHA-256 of the body.
- `forma-consulta.fields.json`: every field of the search form, extracted from the
  capture. This is where the real parameter names come from.

To refresh a fixture, run `pnpm capture --only <case>` and review the diff of the
`.meta.json` file. If SIIAU changed its markup, update `docs/siiau.md` and the
parser tests in the same commit.

The data is public (the same table anyone sees in the Consulta de Oferta
Académica), and it includes professor names as published by the university.

## `synthetic/`

Hand-written pages in SIIAU's style (ISO-8859-1, CRLF, uppercase tags, unclosed
cells) that follow `docs/siiau.md`. They are **not** captures: they let the parser
tests cover every special case before real captures exist, and they keep covering
cases a capture may not show (error pages, unpublished offers). Each file says so in
an HTML comment.

`test/real-fixtures.test.ts` runs the parsers over every real capture in this
folder, so the day real fixtures are committed, they are tested automatically.
