# siteready reference fixture: plain Astro + Cloudflare Pages

A minimal, from-scratch Astro site with **no Starlight** — home page, an about page, and a small
markdown-backed `posts` collection with hand-rolled `.md` mirror routes. Reference fixture for
`../../src/fixers/astro.js`. Checked in with the fixer already applied (the "after" state) —
`scripts/verify-loop.js` strips it back to "before" in a temp copy to test.

## Reproducing the before/after numbers

```sh
cd tools/siteready/fixtures/astro-cf-pages
npm install && npm run build
npx --yes wrangler pages dev dist --port 8788   # local Cloudflare Pages emulation
# in another shell, from tools/siteready:
node src/cli.js http://localhost:8788 --scanners afdocs --sampling deterministic
```

## Why the afdocs `overall` score doesn't move here

Unlike the Starlight fixer, `astro.js` deliberately never generates an `llms.txt` — a plain Astro
site has no content-collection convention to build one from without guessing at the site's own
routing (see `src/fixers/astro.js`'s docstring). afdocs' `overall` score turns out to be **gated**
on `llms.txt` existing: every other category comes back `null` in `categoryScores` whenever
`llms-txt-exists` fails, so `overall` sits at `0` both before and after this fixer runs, even
though individual checks genuinely flip from fail to pass (`http-status-codes` via the new
`404.astro`, `content-negotiation` via the Cloudflare Pages middleware). `scripts/verify-loop.js`
asserts on those individual checks for this fixture instead of the gated overall score — asserting
`overall` improved here would either be a no-op or would require this fixer to grow a scope it's
intentionally staying out of.

- `is-agentic` can't score this fixture locally either, same reason as the Starlight fixture's
  README — its CLI submits to a hosted scan service that can't reach `localhost`.
