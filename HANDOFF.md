# HANDOFF.md

Cross-session context memory. Update this file at the end of every session.

---

## Current Version

**0.2.0** (doc-tracking system's own version — see WORKLOG.md; the underlying
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

First real-world dogfood of the installed skill (item 1 of the previous
session's Next Actions): ran the full scan → enhance → rescan loop against
`docs.doverunner.com` (the DoveRunner Docs Astro+Starlight+Cloudflare-Pages
site, repo at `../docs-starlight`) — the skill's first use outside this repo
and outside the synthetic `examples/` fixture. Baseline: `is-agentic` 68/100
(D), `afdocs` 97/100 (A). `enhance .` correctly detected the stack and added
`functions/_middleware.js` (the one fixer output the target didn't already
have); everything else it supports (llms.txt endpoint, per-page `.md` route,
Banner override) was already present from the target's own earlier work, and
`enhance` correctly skipped those without overwriting. No auto-commit — diff
was left for review as designed.

Found real gaps in fixer coverage: three `is-agentic` checks
(`metadata-completeness`'s `og:image`, `agent-instruction`'s "when to use"
llms.txt section, and a homepage Organization `json-ld`) had no fixer, so
they were hand-patched directly in the target repo instead. That's the
signal to add them as real fixer capabilities — see Next Actions. Net result
after a manual rescan trigger on is-agentic.com: 68 → 72 (D → C).

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

1. Add three fixer capabilities to `astro-starlight.js` (hand-verified this
   session on a live production site, not just the `examples/` fixture):
   (a) `og:image` (+ ideally `og:type` if missing) meta tag via the Head
   component override, (b) homepage Organization JSON-LD (name, url, logo,
   sameAs, **and description** — `is-agentic` flagged missing `description`
   even with name/url/logo present, confirm the exact required field set),
   (c) an "when to use this" section injected into the generated `llms.txt`.
2. Add an `agent-friendly-404` fixer for Cloudflare Pages — a custom 404
   response with a short markdown recovery body (sitemap/llms.txt pointer)
   to move that check from WARN/partial to full credit.
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
