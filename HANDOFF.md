# HANDOFF.md

Cross-session context memory. Update this file at the end of every session.

---

## Current Version

**0.4.0** (doc-tracking system's own version — see WORKLOG.md; the underlying
CLI/engine remains at package.json's `1.0.0`, tagged `v1.0.0` in git)

---

## Project Status

siteready is a CLI orchestration + remediation layer for "agent-readiness" website
scanning. It runs a site through multiple scanners (afdocs, Vercel Is Agentic),
normalizes results into one scorecard, auto-fixes issues its fixers support
(currently Astro + Starlight + Cloudflare Pages), then re-scans and produces a
before/after diff — fully local, no live deployment required. v1.0 is complete:
scan/enhance/rescan/diff-report loop works end-to-end, CI passes on Windows/macOS/
Linux, and the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site
from 0/100 (F) to 97/100 (A) on afdocs.

---

## Last Session

Closed the fixer-coverage gaps found in the v0.3.0 dogfood session against
`docs.doverunner.com` (see WORKLOG.md v0.4.0). Added to `astro-starlight.js`:
a `Head.astro` override (site-wide `og:image`, homepage-only Organization
JSON-LD with name/url/logo/sameAs auto-extracted from the target's own
`starlight({title, social})` config, `description` read live from the
homepage's own frontmatter), a `src/content/docs/404.md` with a short
agent-recovery body (homepage + `/llms.txt` links), and generalized
`patchAstroConfig` to register both `Banner` and `Head` overrides. Applied
the result to the checked-in `examples/astro-starlight-cf-pages` fixture so
it stays a complete reference target, and updated
`scripts/verify-loop.js`'s strip step to match.

Real gotcha hit and fixed: `Astro.props.id` does **not** carry the homepage
route slug on current Starlight (0.42) — route data lives on
`Astro.locals.starlightRoute` now (`Astro.props` for route data is
deprecated per `@astrojs/starlight/props.ts`). Only caught by actually
building the fixture and grepping the HTML output; the first version
silently never rendered the JSON-LD block. Lesson: for any Head/Banner-style
override work, verify against a real `astro build`, not just a syntax check
— an Astro override that reads the wrong prop/local fails silently at
runtime with no compile-time signal.

**Not yet done**: re-verifying these three fixes against the live
`is-agentic` scanner on a fresh site (only verified via local `astro build`
HTML inspection + the `afdocs`-only CI loop so far — see Next Actions #1).
Separately, this session's `is-agentic` rescans of `docs.doverunner.com`
itself swung 68 → 72 → 62 with no site changes between the last two scans —
logged as scanner-side volatility, not a regression, see Open Issues.

Also found a real limitation in `rescan`: calling it against `is-agentic`
twice — once right after `enhance` shipped, once after the target's
production deploy went live — returned the *identical* cached result both
times (same `scanned_at` timestamp), even though `curl` against the live
site confirmed the fixes were already deployed. `is-agentic.com` is a hosted
third-party scanner that caches per domain; our CLI has no lever to force a
fresh crawl. The score only moved once the user manually clicked rescan on
is-agentic.com's own page. `afdocs`, by contrast, re-crawls live every time
(`rescan`'s own timestamp matched the actual invocation time) — this is an
`is-agentic`-specific gotcha, not a general `rescan` bug.

---

## Next Actions

1. Re-run `enhance` against a **fresh** (never hand-patched) Astro+Starlight+
   Cloudflare-Pages site and confirm on `is-agentic` that
   `metadata-completeness` (og:image), `json-ld`/`org-schema-completeness`,
   and `agent-friendly-404` actually move — v0.4.0 added these fixers and
   proved them via `astro build` output inspection + the `afdocs`-only CI
   loop, but never against the live `is-agentic` scanner end-to-end (that
   scanner is non-deterministic/cached — see Open Issues — so this needs a
   real before/after on a real deploy, not just a local build check).
2. The "when to use this" `llms.txt` section (originally Next Actions #1c)
   is **not** a generic fixer candidate — it requires product-specific prose
   (what the site's product areas are) that a fixer can't invent. Leave as
   manual guidance (SKILL.md / README) rather than fixer scope, unless a
   safe generic heuristic turns up.
3. Document (README or SKILL.md) that `is-agentic` results can lag a real
   production change due to server-side caching with no forced-refresh
   option from our CLI — tell users to manually rescan on is-agentic.com if
   `siteready rescan` shows no movement they expect.
4. Decide/document a policy for `org-schema-completeness` (`contactPoint`,
   `address`) and `trust-anchors` on doc subdomains that intentionally defer
   identity/legal pages to a separate corporate domain (this session's
   target: `docs.doverunner.com` defers to `doverunner.com`) — right now
   these just sit as permanent backlog with no way to mark them N/A.
5. Test the installed skill against another unrelated real website project
   to broaden dogfood coverage beyond this one Astro+Starlight site.
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
