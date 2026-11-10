# siteready reference fixture: Astro + Cloudflare Pages with `.md` siblings

A minimal, from-scratch Astro site with **no Starlight** — home page, an about page, and
static `.md` siblings in `public/` (`index.md`, `about.md`) listed in a hand-written
`public/llms.txt`. Reference fixture for the `md-duplicate-signal` check in
`../../src/scanners/agent-headers.js` and the `/*.md` + `X-Robots-Tag: noindex`
fixer in `../../src/platforms/cloudflare-pages.js`. Checked in with the fixer
already applied (the "after" state) — `scripts/verify-loop.js` strips it back to
"before" in a temp copy to test.

## Why static `.md` files instead of `.md.ts` routes

The check only needs a `.md` URL that serves 200 with an HTML twin that serves
200 and no `Link: rel="canonical"` / `X-Robots-Tag: noindex` signal. Static files
in `public/` are the smallest way to get that, and they match the real-world
pattern (a site whose `.md` mirrors are pre-built files). The `.md.ts` route
variant is already covered by `astro-cf-pages`.

## Why `llms.txt` uses the Starlight generator's format

The entries are `- [Title](/path/): description — markdown: /path.md`, with the
`.md` path bare (not a `](...)` link) — exactly what `src/fixers/astro-starlight.js`
generates. The scanner's `extractLinks` must match that bare form, or no `.md`
link is ever probed on a Starlight site (see the `extractLinks` comment in
`src/scanners/agent-headers.js`). This fixture proves it end to end: without the
bare-path match, `agent-headers-md-links` skips and `md-duplicate-signal` skips
too.

## Reproducing the before/after numbers

```sh
cd tools/siteready/fixtures/astro-md-duplicates-cf-pages
npm install && npm run build
npx --yes wrangler pages dev dist --port 8788   # local Cloudflare Pages emulation
# in another shell, from tools/siteready:
node src/cli.js http://localhost:8788 --scanners agent-headers --sampling deterministic
# before: md-duplicate-signal FAIL (no _headers); after `node src/cli.js enhance <path>`: PASS
```

## What verify-loop asserts here

`md-duplicate-signal` flips fail → pass across scan → enhance → rescan, and
`enhance` writes `public/_headers`. The other agent-headers checks are expected
to pass in both states (the `.md` files serve 200, the middleware negotiates),
so this fixture asserts only on the new check.
