# siteready reference fixture: Next.js (App Router) + Vercel

A minimal, from-scratch Next.js site — home page, an about page, and two posts — with pre-built
`.md` siblings for every page under `public/`. Reference fixture for `../../src/fixers/nextjs.js`
and `../../src/platforms/vercel.js`. Checked in with both fixers already applied (the "after"
state) — `scripts/verify-loop.js` strips it back to "before" in a temp copy to test.

## Reproducing the before/after numbers

```sh
cd tools/siteready/fixtures/nextjs-vercel
npm install && npm run build
npm run start -- -p 3000   # `next start` — a real server, so Edge Middleware runs
# in another shell, from tools/siteready:
node src/cli.js http://localhost:3000 --scanners afdocs --sampling deterministic
```

## Markdown mirrors come from the generator, not committed files

Next.js has no content-collection convention, so `nextjs.js` generates `llms.txt` and `.md` mirrors from the
build output (`scripts/agent-readiness.mjs`, run as `postbuild`; git-ignored output). This fixture ships none:
`verify-loop` asserts `llms-txt-exists` and `markdown-url-support` flip fail → pass, and `vercel.js`'s
negotiation then serves the generated `<path>.md` siblings. (`../nextjs-opennext-monorepo` keeps committed
`.md` files because the generator is deliberately not used on OpenNext.)

- `is-agentic` can't score this fixture locally either, same reason as the Astro fixtures' READMEs
  — its CLI submits to a hosted scan service that can't reach `localhost`.
