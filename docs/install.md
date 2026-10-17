---
title: Install
---

[← Back to index](index)

# Install

```bash
# as a tool, globally
npm install -g siteready
siteready https://example.com

# or without installing
npx siteready https://example.com

# from a source checkout (contributors, or to use it as a Claude Code skill)
git clone https://github.com/dkdev24/siteready.git
cd siteready && npm link      # puts `siteready` on your PATH
```

Needs Node ≥18. No API keys and no accounts for the default scanners — they're invoked via `npx`
on demand.

From a source checkout without `npm link`/`npm install -g`, every command works the same with
`node src/cli.js` in place of `siteready` (`node src/cli.js https://example.com`, etc.) — the
binary is just a shim over that entry point.

## Using it as a Claude Code skill

Point Claude Code at a checkout containing `SKILL.md`; the skill invokes the same CLI you'd run by
hand — see the [README](https://github.com/dkdev24/siteready#readme) for the tool-vs-skill design.

## Status

| Piece | Status |
|---|---|
| Scanners | [afdocs](https://agentdocsspec.com/) (doc-heavy sites), [Vercel Is Agentic](https://is-agentic.com/) (any content site) — both run by default. [Ora](https://ora.ai/) (the engine behind Is Agentic) is opt-in (`--scanners ora`) |
| Fixer | Astro + Starlight or plain Astro, on Cloudflare Pages, Netlify, or GitLab Pages; Next.js (App Router) on Vercel, Netlify, or AWS (CloudFront + OpenNext), including monorepos; Jekyll on GitHub Pages or GitLab Pages |
| Loop | `scan → enhance → rescan → diff-report`, fully local (no live deployment needed) |
| CI | Windows, macOS, and Linux, on every push |
| Other frameworks/platforms | Not yet — additive, by demand (see [Contributing](contributing)) |

No fixer/platform pairing above requires a new account or authentication — Netlify and GitLab
Pages targets build and serve through the same local-only path as everything else (see
[Architecture](architecture)).

**Real numbers:** the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site from
**0/100 (F) → 97/100 (A)** on afdocs — see `fixtures/astro-starlight-cf-pages/README.md` in the
repo for how to reproduce that yourself with no deployment required.

The plain-Astro fixer (`src/fixers/astro.js`) is deliberately smaller: without Starlight's `docs`
content collection and component-override system, a fixer can't safely generate a content-aware
`llms.txt` or `.md` mirror routes for an arbitrary Astro site — it would have to guess the site's
own routing/slug conventions, and a wrong guess produces broken links, which is worse than no fix.
It covers what's safe regardless of content shape: a real `404.astro`, a permissive `robots.txt`
(with a `Sitemap:` line if `site` + `@astrojs/sitemap` are both present), and — only if the repo
already has a hand-rolled markdown-mirror route that echoes a collection entry's raw `.body` — a
`smartQuotes()` typography-normalization util plus a named warning to wire it in (see
[Architecture](architecture) for why). Verified against a real production Astro (non-Starlight) +
Cloudflare Pages site: correctly detects the stack, skips everything already present, and a second
`enhance` run is a clean no-op.

The Next.js + Vercel fixer (`src/fixers/nextjs.js` + `src/platforms/vercel.js`) follows the same
shape as the plain-Astro fixer for its static files: a real `app/not-found.js` (skipped when any
`not-found.{js,jsx,ts,tsx}` exists under `app/`), a permissive `robots.txt` (skipped when an
`app/robots.*` route exists; `Sitemap:` line if `next-sitemap.config.js` declares a `siteUrl`), and a
root `proxy.js` (Next.js 16's renamed `middleware.js`) for `Accept: text/markdown` negotiation.

Next.js has no content-collection convention to read `llms.txt` or `.md` mirrors from, so the fixer
generates them from the **build output** instead. **Not on AWS (CloudFront + OpenNext):** every directory in
`public/` becomes a CloudFront behavior routed to S3, so mirrors under a route prefix would make the HTML
pages there return 403. There `enhance` skips the generator and says so; serve mirrors from a route handler
or a CloudFront function. It copies a zero-dependency script to
`scripts/agent-readiness.mjs` and adds `"postbuild": "node scripts/agent-readiness.mjs"` (only if the
app has a `build` script and no `postbuild` yet; npm, pnpm and OpenNext's build all run it). After
`next build` the script reads `.next/prerender-manifest.json`, converts every prerendered page's HTML
(`<main>`, or the body minus header/nav/footer) to `public/<route>.md`, and writes `public/llms.txt`
(split into per-section files above ~30 KB). It never fails the build, only replaces files it wrote
itself (marked with a trailing comment), removes stale ones, and skips `llms.txt` if you have an
`app/llms.txt` route. A page's mirror lives at its canonical path + `.md` (so a rewritten default locale gets `/x.md`, not
`/en/x.md`), and links are absolute when a page declares a canonical URL (or `AGENT_READINESS_ORIGIN` is
set to an origin), otherwise root-relative. `AGENT_READINESS_ORIGIN=none` forces root-relative links;
`scan-local`/`rescan-local`/`loop` set it for their build so a local scan never follows production URLs. Limits: App Router only; server-rendered
routes and `output: "export"` sites aren't covered; add the generated files to `.gitignore`; the
`llms.txt` pointer in each page's HTML (afdocs `llms-txt-directive-html`) needs a layout change that
siteready doesn't make. `fixtures/nextjs-vercel`
proves it end to end via `scripts/verify-loop.js`: `content-negotiation` flips fail → pass on a
stripped copy, served locally with `next start` (not a static export — Proxy doesn't run under
one).

**AWS (CloudFront + OpenNext)** (`src/platforms/aws-cloudfront-opennext.js`) reuses the same Next.js
framework fixer. It's picked when `detectStack` sees an OpenNext signal (`open-next.config.*`,
`sst.config.*`, or a `@opennextjs/aws` / `cdk-nextjs-standalone` / `cdk-nextjs` / `sst` dependency) in
the app, the workspace root, any workspace member, or an infra-looking sibling package, and no
`vercel.json`/`netlify.toml`/`wrangler.*` says otherwise. It writes the negotiation file as
`proxy.js` for Next.js 16+ or `middleware.js` for older or unknown versions, and skips it if the app
already has either (apps with i18n or auth usually do; merge by hand). siteready never edits CDK,
SST or Terraform, so every run also prints two checks it can't make locally: CloudFront's cache key
must include `Accept`, and `public/*.md` must be reachable through CloudFront (S3), not only the
server function. `scan-local` runs `next start`, which proves the negotiation code but not either
point; scan the deployed URL for those.

**Monorepos** (npm/yarn `workspaces` or `pnpm-workspace.yaml`): point siteready at the workspace
root and it finds the one Astro or Next.js package and fixes/builds/serves that; point it at the app
dir and it walks up to the workspace root for platform signals. With more than one framework package
it stops and lists them. In a pnpm/yarn/bun workspace it won't run `npm install` itself; install
first, then re-run. Layouts without a workspace file aren't auto-detected.

Netlify (`src/platforms/netlify.js`) gets the same `Accept: text/markdown` negotiation as
Cloudflare Pages and Vercel, via a Netlify Edge Function (`netlify/edge-functions/
markdown-negotiation.js`) rather than a `netlify.toml` edit. GitHub Pages and GitLab Pages are
purely static hosts with no equivalent request-header branching — their platform modules write
nothing and report that one check as a structural gap instead, same as the framework/platform axis
split for every other pairing (see [Architecture](architecture)).
