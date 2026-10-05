# ¿Hay Cupo?

Get notified when a seat opens up in a University of Guadalajara course section,
instead of reloading SIIAU's course offering page over and over.

> Work in progress. Independent student project, not affiliated with the University
> of Guadalajara. Full READMEs (English and Spanish) come with the launch.

## Layout

| Path                | What it is                                                     |
| ------------------- | -------------------------------------------------------------- |
| `packages/siiau`    | SIIAU client and parser, tested against real captured fixtures |
| `tools/cf-probe`    | One-off Worker to check that SIIAU answers from Cloudflare     |
| `docs/siiau.md`     | How SIIAU's course offering works (in Spanish)                 |
| `docs/decisions.md` | Technical decisions and their trade-offs (in Spanish)          |

## Development

Requires Node.js 22.13+ (24 recommended, see `.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

### Capturing SIIAU fixtures

```sh
cp .env.example .env.local   # then set SIIAU_CONTACT_EMAIL
pnpm capture                 # or: pnpm capture --only forma-consulta
```

The script checks `robots.txt`, makes one request at a time with a 3 s pause, and
stops at the first error. See `packages/siiau/test/fixtures/README.md`.
