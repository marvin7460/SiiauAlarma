# cf-probe

One-off Worker that answers a single question before we build the poller on Cloudflare:
**does SIIAU answer requests that leave from Cloudflare's network?** It also reports
whether the runtime can decode ISO-8859-1.

On each authorized call it makes 5 requests, one at a time and 3 s apart: `robots.txt`
and the search form on both hosts, plus one offer query. It checks `robots.txt` first
and identifies itself with the project's User-Agent.

## Run it

From `tools/cf-probe`:

```sh
pnpm wrangler login                          # opens the browser, free Cloudflare account
pnpm run deploy                              # prints the https://haycupo-probe.<you>.workers.dev URL
pnpm wrangler secret put PROBE_KEY           # any long random string
pnpm wrangler secret put SIIAU_CONTACT_EMAIL # the address that goes in the User-Agent
```

Open `https://haycupo-probe.<you>.workers.dev/?key=<PROBE_KEY>` **once** and copy the
JSON. Without the right key it answers 404, so nobody else can make it hit SIIAU.

Then remove it:

```sh
pnpm wrangler delete
```

## Reading the result

- `results[].status` 200 with a `title`: SIIAU answers from Cloudflare.
- `status` 403/5xx or an `error` on every request: SIIAU (or its firewall) rejects
  Cloudflare. We switch to plan B (see `docs/decisions.md`).
- `colo` / `country`: the Cloudflare data center the requests left from.
- `textDecoder`: whether `TextDecoder` supports `windows-1252` and `iso-8859-1`.
