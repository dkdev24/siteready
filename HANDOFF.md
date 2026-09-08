# HANDOFF.md

Cross-session context memory. Update this file at the end of every session.

---

## Current Version

**0.5.0** (doc-tracking system's own version — see WORKLOG.md; the underlying
CLI/engine is now at package.json's `1.1.0`, to be tagged `v1.1.0` in git)

---

## Project Status

siteready is a CLI orchestration + remediation layer for "agent-readiness" website
scanning. It runs a site through multiple scanners (afdocs, Vercel Is Agentic),
normalizes results into one scorecard, auto-fixes issues its fixers support
(Astro + Starlight, and now plain Astro without Starlight, both + Cloudflare
Pages), then re-scans and produces a before/after diff — fully local, no live
deployment required. v1.0 shipped the Astro+Starlight+Cloudflare-Pages fixer
(fresh Starlight site: 0/100 F → 97/100 A on afdocs). v1.1 adds a second,
intentionally-narrower fixer for plain Astro sites with no Starlight.

---

## Last Session

Added `src/fixers/astro.js` — the framework fixer for plain Astro (no
Starlight): `detectStack` now returns `framework: "astro"` for any repo with
an `astro` dependency but no `@astrojs/starlight`, and `enhance.js` dispatches
by framework (`astro-starlight` vs `astro`) instead of hardcoding the
Starlight fixer. Unlike `astro-starlight.js`, this fixer can't generate a
content-aware `llms.txt` or `.md` mirror routes — no `docs` collection or
component-override convention to build on, and guessing at an arbitrary
site's routing produces broken links, which is worse than no fix (same
reasoning as the already-documented "when to use this" stance below). It
covers three things that are safe regardless of content shape: a real
`src/pages/404.astro`, a permissive `public/robots.txt` (with a `Sitemap:`
line only when both `site` and `@astrojs/sitemap` are present in
`astro.config.*`), and — only when the repo already has a hand-rolled
markdown-mirror route (`*.md.ts` under `src/pages` that echoes a collection
entry's `.body`/`entry.body` verbatim) — a new `smartQuotes()` typography
util plus a named warning to wire it into that specific route.

The `smartQuotes()` fix exists because of a real bug found dogfooding a
production Astro (non-Starlight) site this session: Astro runs
`remark-smartypants` by default, curling straight quotes/apostrophes on
*rendered HTML* only — a route serving a collection entry's raw `.body` never
gets that transform, so afdocs' `markdown-content-parity` check flagged
43–49% of quote-heavy blog posts as "missing content" that was actually
present verbatim, just with different quote characters. Confirmed via `curl`
diffing the live `.md` route against the live rendered page. Traced and fixed
by hand in the target repo first, then generalized into this fixer. A
residual, smaller gap remains on posts using Markdown footnotes (`[^1]`
source vs. a bare rendered number with no brackets) — looks like a structural
limit of that specific check, not something worth chasing further.

Detection heuristic for "does this route need the warning" went through one
false-positive round: originally any `*.md.ts` file was flagged, which
incorrectly warned about index/listing routes and a data-driven `about.md.ts`
that don't echo raw body content at all. Fixed by requiring a `.body` (or
`entry.body`) reference in the file before warning — verified against the
real target repo (which has both false-positive-shaped routes and two
genuine `.body`-echoing routes) that this correctly warns on zero files after
the target's own routes were already fixed by hand, and zero routes are
flagged on the listing/about routes.

Tested via a scratch `rsync` copy of a real production Astro+Cloudflare-Pages
site (not a synthetic fixture — none built yet, see Next Actions): `enhance`
correctly detects `astro + cloudflare-pages`, writes `robots.txt` +
`functions/_middleware.js`, skips the already-present `404.astro` and
`smartquotes.ts`, and a second `enhance` run is a clean no-op (everything
skipped, nothing rewritten) — matches CONTRIBUTING.md's testing bar.

Also closed out the long-open Next Actions #3 from v0.4.0: documented in both
README.md ("Design notes") and SKILL.md ("What to tell the user afterward")
that `is-agentic` rescans can return an identical cached result even after a
confirmed-live production deploy, with the concrete instruction to verify via
`curl` before reporting a fix as not-working.

---

## Next Actions

1. Build a synthetic `examples/astro-cf-pages/` fixture (plain Astro, no
   Starlight) mirroring `examples/astro-starlight-cf-pages/`, and wire it into
   `scripts/verify-loop.js` for CI coverage of the new fixer — currently only
   verified by hand against a real site's scratch copy (see Last Session),
   not by the automated loop.
2. Re-run `enhance` (plain-Astro fixer) against a **fresh** site that has
   none of these fixes yet and confirm the `is-agentic`/`afdocs` score
   actually moves on a real deploy — this session's verification was
   structural (file writes, idempotency) against a site that already had
   most of the content-side fixes applied by hand, not a full before/after
   score delta.
3. The "when to use this" `llms.txt` section is **not** a generic fixer
   candidate for either Astro fixer — it requires product-specific prose a
   fixer can't invent. Leave as manual guidance, unless a safe generic
   heuristic turns up.
4. Decide/document a policy for `org-schema-completeness` (`contactPoint`,
   `address`) and `trust-anchors` on doc subdomains that intentionally defer
   identity/legal pages to a separate corporate domain — right now these
   just sit as permanent backlog with no way to mark them N/A.
5. Test the installed skill against another unrelated real website project
   to broaden dogfood coverage.
6. Add fixers for additional frameworks/platforms as demand comes in (see
   CONTRIBUTING.md for the fixer contribution process).
7. Consider expanding scanner coverage beyond afdocs + Vercel Is Agentic.

---

## Open Issues

- `is-agentic` scan results can be stale (server-side cache, no forced
  refresh available) — see Last Session / Next Actions #3.
- `is-agentic`'s score has shown double-digit swings (68 → 72 → 62) across
  scans of the same unchanged-in-the-interim site (`docs.doverunner.com`),
  concentrated in its API-surface `essential`/`recommended` checks
  (openapi-spec, oauth-support, json-error-responses, etc.) — checks that
  are structurally inapplicable to a docs-only site with no public API.
  Looks like scoring/weighting volatility (possibly LLM-judged) on that
  scanner's end, not something our fixer output caused — the two checks we
  did target (`json-ld`, `agent-friendly-404`) both moved the *right*
  direction across that same window. No action item beyond awareness; can't
  do anything about a third party's scoring stability from our side.

---

## Key Paths

| Path | Purpose |
|---|---|
| `src/cli.js` | CLI entrypoint (scan / enhance / rescan / diff-report / loop) |
| `src/scan.js`, `src/scanners/` | Scanner orchestration (afdocs, is-agentic) |
| `src/enhance.js`, `src/fixers/` | Framework/platform detection + auto-fixers |
| `src/report.js`, `src/diff-report.js` | Scorecard normalization + before/after diffing |
| `src/loop.js` | Full local scan→enhance→rescan→diff-report loop |
| `examples/astro-starlight-cf-pages/` | Reference fixer target + reproduction steps |
| `scripts/verify-loop.js` | CI verification of the full loop |
| `siteready-plan.md` | Original design/planning doc |
| `SKILL.md` | Claude Code skill entrypoint — orchestration instructions for running siteready as an agent, cwd-agnostic (uses `<skill-dir>`) |
