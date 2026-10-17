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

## Why this fixture uses static `.md` siblings instead of markdown-mirror routes

The Astro fixtures' `.md.ts` routes render a mirror on request from a content collection — Next.js
has no equivalent built-in convention, so `nextjs.js` generates mirrors from the build output
instead (see `../nextjs-opennext-monorepo`, which ships none and lets the generator produce them).
This fixture keeps committed `.md` files on purpose: `verify-loop` asserts the generator leaves
files it didn't write byte-identical while still adding `llms.txt`. Its `.md` files live
as ordinary static files under `public/`, served automatically by Next.js at the same path as their
HTML page (`/posts/hello-world` + `/posts/hello-world.md`). `vercel.js`'s middleware only needs a
`.md` sibling to exist at `<path>.md` — it doesn't care how it got there.

- `is-agentic` can't score this fixture locally either, same reason as the Astro fixtures' READMEs
  — its CLI submits to a hosted scan service that can't reach `localhost`.
