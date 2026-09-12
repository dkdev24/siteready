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
| Fixer | Astro + Starlight or plain Astro, on Cloudflare Pages, Netlify, or GitLab Pages; Next.js (App Router) on Vercel or Netlify; Jekyll on GitHub Pages or GitLab Pages |
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
shape as the plain-Astro fixer — no content-collection convention to build an `llms.txt` or mirror
routes from, so it sticks to a real `app/not-found.js`, a permissive `robots.txt` (with a
`Sitemap:` line if `next-sitemap.config.js` declares a `siteUrl`), and a root `proxy.js` (Next.js
16's renamed `middleware.js`) for `Accept: text/markdown` negotiation. `fixtures/nextjs-vercel`
proves it end to end via `scripts/verify-loop.js`: `content-negotiation` flips fail → pass on a
stripped copy, served locally with `next start` (not a static export — Proxy doesn't run under
one).

Netlify (`src/platforms/netlify.js`) gets the same `Accept: text/markdown` negotiation as
Cloudflare Pages and Vercel, via a Netlify Edge Function (`netlify/edge-functions/
markdown-negotiation.js`) rather than a `netlify.toml` edit. GitHub Pages and GitLab Pages are
purely static hosts with no equivalent request-header branching — their platform modules write
nothing and report that one check as a structural gap instead, same as the framework/platform axis
split for every other pairing (see [Architecture](architecture)).
