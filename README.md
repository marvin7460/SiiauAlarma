# ¿Hay Cupo?

[![CI](https://github.com/marvin7460/SiiauAlarma/actions/workflows/ci.yml/badge.svg)](https://github.com/marvin7460/SiiauAlarma/actions/workflows/ci.yml)

Get notified the moment a seat opens up in a University of Guadalajara course section, instead
of reloading SIIAU over and over during registration week.

> Independent student project. **Not affiliated with the University of Guadalajara.**
> [Leer en español](README.es.md).

![Searching a subject, asking for an alert and getting the "seat open" email](docs/demo.gif)

<sub>Recorded against the fake SIIAU used in the tests (`pnpm --filter @haycupo/web demo:gif`).
Sections and professors are made up.</sub>

## The problem

At the University of Guadalajara (UdeG), students register for classes in SIIAU. Popular
sections fill up in minutes, and seats only come back when someone drops the class. The only
way to catch one is to keep reloading SIIAU's public course-offering page, by hand, for days.
That wastes students' time and puts load on SIIAU.

**¿Hay Cupo?** ("Any seats?") watches the sections you care about and tells you, by email,
Telegram or a browser notification, as soon as one goes from 0 to 1 or more free seats.

## Live app

Launching before the 2027A registration period (January 11–15, 2027).

<!-- TODO(Marvin): replace the line above with the production URL once it is deployed. -->

## Features

- **Search** by cycle, campus and subject (code or name, with autocomplete). Every section shows
  its NRC, capacity, free seats, schedule, building and room, professor, and how fresh the data
  is.
- **Alerts** for a specific NRC, for _any_ section of a subject (optionally filtered by days,
  time window or professor), or for when the offer of a subject is published.
- **Three channels:** email (magic-link sign-in, no passwords), a Telegram bot, and Web Push
  notifications (installable PWA, iPhone included).
- **No false alarms, no spam:** only 0 → >0 transitions count; SIIAU errors or odd pages never
  trigger alerts; one message per alert every 30 minutes at most. Alerts expire on their own
  when registration ends.
- **Public pages:** a [status page](apps/web/src/app/estado/page.tsx) (is it running right
  now?), cookieless [impact metrics](apps/web/src/app/impacto/page.tsx), a privacy notice, and
  self-service "download my data" and "delete my account".

## Stack

| Layer         | Choice                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Web           | Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS 4 on Vercel  |
| Worker        | TypeScript on Cloudflare Workers (cron every minute); same code runs on Node |
| Database      | Postgres on Supabase, Drizzle ORM and migrations; PGlite in tests            |
| Validation    | Zod everywhere data crosses a boundary (SIIAU pages, API, forms, env vars)   |
| Notifications | Resend (email), Telegram Bot API, Web Push (VAPID, RFC 8291) with WebCrypto  |
| Tests         | Vitest (unit, integration against a fake SIIAU), Playwright (end to end)     |
| Tooling       | pnpm workspaces, ESLint (strict type-checked), Prettier, GitHub Actions      |

Everything runs on free plans.

## Architecture

```mermaid
flowchart LR
  student([Student]) -- search, alerts --> web["apps/web<br/>Next.js on Vercel"]
  web -- "internal API (token)" --> worker["apps/worker<br/>Cloudflare Worker"]
  web --> db[("Postgres<br/>Supabase")]
  cron{{"Cron, every minute"}} --> worker
  worker -- "one request at a time,<br/>3 s apart" --> siiau["SIIAU<br/>public course offering"]
  worker --> db
  worker -- email --> resend[Resend]
  worker -- messages --> telegram[Telegram]
  telegram -- "webhook (/start, /alertas)" --> worker
  worker -- "Web Push" --> push["Browser push services"]
```

- **The worker is the only thing that talks to SIIAU.** The website asks the worker, never SIIAU
  directly: one exit means one User-Agent, one pace and one place to pull the brake.
- **A gateway row in Postgres** hands out turns (a lease, so only one request is in flight
  anywhere), enforces the pause between requests using the database clock, caches
  `robots.txt`, and holds the circuit breaker.
- **Polling is per subject, not per student.** Every minute the cron claims the most overdue
  subject that someone is waiting for (`FOR UPDATE SKIP LOCKED`), fetches its page once,
  compares free seats with the last poll, and writes notifications to an outbox in the same
  transaction. On Cloudflare each subject gets its own invocation (and its own 10 ms CPU
  budget) through a service binding.
- **The dispatcher** sends the outbox by email, Telegram or push, with retries, the daily email
  quota and a cutoff for stale messages ("there is a seat" from an hour ago is useless).
- **Searches are shared:** results are cached for 5 minutes per query, so a hundred students
  looking at the same subject cost one request to SIIAU.

## Responsible use of SIIAU

These rules are not negotiable, and most are enforced in code rather than by convention:

- **Query by subject, not by student:** alerts are grouped by (cycle, campus, subject); one
  request serves all of them.
- **Only subjects with active alerts** are polled. Alerts expire when registration ends.
- **One request at a time, at least 3 seconds apart** (the configuration refuses anything
  under 2 s).
- **Every 5 minutes per subject**, every 2 during registration week, every hour when the offer
  is not published yet. The configuration refuses intervals under 2 minutes.
- **Exponential backoff** per subject on errors, and an **emergency brake**: after 5 errors in
  a row everything pauses (15 minutes, doubling up to 6 hours), plus a manual brake and a kill
  switch.
- **Identifies itself:** the User-Agent carries the project name and a contact email, and
  `robots.txt` is fetched and respected (RFC 9309).
- **Never** registers classes, asks for SIIAU passwords or gets around captchas. Only the
  public course-offering page is used.

## Technical decisions and trade-offs

The full list, with the alternatives considered, is in [docs/decisions.md](docs/decisions.md)
(in Spanish). Highlights:

- **A strict parser over a tolerant one.** SIIAU serves old ISO-8859-1 HTML. The parser
  (htmlparser2 + Zod) throws on anything unexpected; not alerting is better than alerting
  wrongly. It reads weekdays by column position and has its own windows-1252 table, because
  Node's `TextDecoder` treats `windows-1252` as Latin-1.
- **Postgres instead of a Durable Object** for the global lock: the same code works on
  Cloudflare, on a VM and in tests, at the cost of a few extra queries per request.
- **One Worker invocation per subject** to fit the free plan's 10 ms of CPU (parsing a typical
  subject takes 2–3 ms; ten at once would not fit).
- **Hand-rolled magic link instead of an auth library**: stores only the email (no IP, no
  User-Agent), hashes every token, and signs in with a button press so mail scanners cannot
  burn the link.
- **An outbox** between detecting a change and delivering it, so a failing email provider never
  loses or repeats an alert.
- **Row Level Security on every table** with no policies: Supabase's public Data API reads
  nothing, while the app (the tables' owner) is unaffected.
- **Push endpoints are allow-listed** to real browser push services, so a crafted subscription
  cannot turn the worker into a proxy.
- **No visitor analytics at all.** Impact metrics are daily aggregate counters; there is no
  cookie banner because there is nothing to consent to.

## Numbers

Measured, not estimated:

| What                                                | Value                                 |
| --------------------------------------------------- | ------------------------------------- |
| Unit and integration tests (Vitest)                 | 251 passing                           |
| End-to-end tests (Playwright, real servers)         | 6 passing                             |
| Parse a 30-section page (decode + parse + validate) | 2.3 ms (Node 22, median of 50 runs)   |
| Parse a 100-section page                            | 7.2 ms                                |
| Worker bundle for Cloudflare                        | 245 KB gzipped                        |
| Requests to SIIAU per subject, regardless of users  | 1 every 5 minutes (2 in registration) |

Usage numbers (seats found, average wait, alerts) are public and live at `/impacto` once the
app is deployed.

<!-- TODO(Marvin): after the 2027A registration week, add the real numbers from /impacto here
(seats found, average time until a seat opened, students, alerts) and one or two sentences on
what they mean. -->

## Run it locally

Requires Node.js 24 (see `.nvmrc`; 22.13+ works), pnpm 10 and PostgreSQL 16+.

```sh
pnpm install
cp .env.example .env.local     # fill in DATABASE_URL, INTERNAL_API_TOKEN, APP_SECRET, SIIAU_CONTACT_EMAIL
pnpm --filter @haycupo/db migrate

pnpm --filter @haycupo/fake-siiau start   # fake SIIAU on :8788 (SIIAU_ORIGIN_OVERRIDE points here)
pnpm --filter @haycupo/worker dev         # worker on :8787, polls every minute
pnpm --filter @haycupo/web dev            # site on http://127.0.0.1:3000
```

With `EMAIL_TRANSPORT=log`, sign-in links and alerts are printed in the terminal. To open a
seat in the fake SIIAU:

```sh
curl -X POST localhost:8788/__fake/available \
  -d '{"cycle":"202620","center":"D","nrc":"78088","available":1}'
```

To point the worker at the real SIIAU, leave `SIIAU_ORIGIN_OVERRIDE` empty. Please keep the
default pacing.

## Tests

```sh
pnpm lint && pnpm typecheck && pnpm test     # what CI runs first
pnpm --filter @haycupo/web test:e2e          # Playwright: builds the site, starts everything
```

- **Parser** tests run against SIIAU-style fixtures (and against real captured pages once they
  are added with `pnpm capture`).
- **Change detection, anti-spam, schedule and filters** are pure functions in `packages/core`.
- **Gateway** tests cover pacing, the lease, the breaker, robots.txt and the kill switch against
  a real Postgres (PGlite).
- **The poll cycle integration test** runs the whole pipeline against the fake SIIAU: a seat
  going from 0 to 1 sends exactly one email (and one Telegram message and one push when those
  channels are on), and nothing is sent when SIIAU fails or changes its HTML.
- **End to end:** search → sign in by magic link → create alert → seat opens → exactly one email
  captured; the same through Telegram (linking via the webhook, message captured by a fake Bot
  API); data export and account deletion; public pages without cookies.

## Deploy

Step by step, all on free plans: [docs/deploy.md](docs/deploy.md) (Spanish). Telegram bot setup:
[docs/telegram.md](docs/telegram.md). After CI passes on `main`, GitHub Actions runs
migrations, deploys the worker, then the website.

## Project layout

| Path               | What it is                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| `apps/web`         | Next.js site: search, alerts, account, status, metrics (Vercel)        |
| `apps/worker`      | The only process that talks to SIIAU: gateway, poller, dispatcher, bot |
| `packages/siiau`   | SIIAU client and parser (runtime-agnostic), with fixtures              |
| `packages/core`    | Pure rules: change detection, filters, anti-spam, schedule, expiry     |
| `packages/db`      | Drizzle schema, migrations, PGlite test database                       |
| `packages/notify`  | Email, Telegram and Web Push channels, message templates, signed links |
| `tools/fake-siiau` | Fake SIIAU (and fake Telegram Bot API) for tests and local development |
| `tools/cf-probe`   | One-off Worker to check that SIIAU answers from Cloudflare             |
| `docs/`            | SIIAU analysis, decisions, deploy and Telegram guides (in Spanish)     |

## How I used AI

This project was built with [Claude Code](https://claude.com/claude-code), Anthropic's coding
agent, working from a written brief: the problem, the requirements, the non-negotiable rules
for using SIIAU responsibly, and my own analysis of how SIIAU's course offering works
([docs/siiau.md](docs/siiau.md)).

- **How we worked:** five phases (parser → search → email alerts → Telegram and push → launch
  pages and docs). Each phase ended with lint, type checks and tests passing, a commit, and a
  list of things to test by hand. Every important decision was written down with its
  trade-offs in [docs/decisions.md](docs/decisions.md), including the places where the
  original plan changed (a Postgres lease instead of a Durable Object; a hand-rolled magic
  link instead of an auth library).
- **What the AI did:** most of the code, tests and documentation, plus catching problems along
  the way (Node's windows-1252 decoding bug, the 10 ms CPU limit, Supabase's public Data API,
  push endpoints as a proxy).
- **What it could not do, and I did or still have to do:** check the parser against real SIIAU
  pages (the development sandbox could not reach SIIAU), deploy and verify on Cloudflare, and
  decide product questions. A few small, self-contained pieces were left on purpose for me to
  write by hand, each marked `TODO(Marvin)` with hints and skipped tests that define "done".
- **Guardrails:** tests before trusting anything (a fake SIIAU, a real Postgres in memory,
  end-to-end runs), CI on every push, no secrets in the repository.

<!-- TODO(Marvin): add a few sentences in your own words: what you reviewed or changed, what you
learned, and what you would do differently. That is the part a reader cares about most. -->
