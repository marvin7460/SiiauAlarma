# ¿Hay Cupo?

Get notified when a seat opens up in a University of Guadalajara course section,
instead of reloading SIIAU's course offering page over and over.

> Work in progress. Independent student project, not affiliated with the University
> of Guadalajara. Full READMEs (English and Spanish) come with the launch.

## Layout

| Path                | What it is                                                         |
| ------------------- | ------------------------------------------------------------------ |
| `apps/web`          | Next.js site: search, results (Vercel)                             |
| `apps/worker`       | The only process that talks to SIIAU (Cloudflare Workers, or Node) |
| `packages/siiau`    | SIIAU client and parser, tested against fixtures                   |
| `packages/db`       | Drizzle schema, migrations and a PGlite test database              |
| `tools/fake-siiau`  | Fake SIIAU for tests and local development                         |
| `tools/cf-probe`    | One-off Worker to check that SIIAU answers from Cloudflare         |
| `docs/siiau.md`     | How SIIAU's course offering works (in Spanish)                     |
| `docs/decisions.md` | Technical decisions and their trade-offs (in Spanish)              |

## Development

Requires Node.js 22.13+ (24 recommended, see `.nvmrc`), pnpm 10 and PostgreSQL 16+.

```sh
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL, INTERNAL_API_TOKEN, SIIAU_CONTACT_EMAIL
pnpm --filter @haycupo/db migrate

pnpm --filter @haycupo/fake-siiau start   # fake SIIAU on :8788 (SIIAU_ORIGIN_OVERRIDE points here)
pnpm --filter @haycupo/worker dev         # worker on :8787
pnpm --filter @haycupo/web dev            # site on :3000
```

Checks (the same ones CI runs):

```sh
pnpm lint && pnpm typecheck && pnpm test
```

### Capturing SIIAU fixtures

```sh
pnpm capture                 # or: pnpm capture --only forma-consulta
```

The script checks `robots.txt`, makes one request at a time with a 3 s pause, and
stops at the first error. See `packages/siiau/test/fixtures/README.md`.
