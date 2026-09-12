# ISSUES.md

Known open issues / limitations not yet actioned. Append new entries; remove one
once it's actually resolved (not just worked around) and note the fix in
WORKLOG.md instead.

---

- `is-agentic` scan results can be stale (server-side cache, no forced
  refresh available) — see WORKLOG.md, NEXT_ACTIONS.md #3.
- `is-agentic`'s score has shown double-digit swings (68 → 72 → 62) across
  scans of the same unchanged-in-the-interim site (a real production
  Astro + Starlight docs subdomain, no public API),
  concentrated in its API-surface `essential`/`recommended` checks
  (openapi-spec, oauth-support, json-error-responses, etc.) — checks that
  are structurally inapplicable to a docs-only site with no public API.
  Looks like scoring/weighting volatility (possibly LLM-judged) on that
  scanner's end, not something our fixer output caused — the two checks we
  did target (`json-ld`, `agent-friendly-404`) both moved the *right*
  direction across that same window. Can't do anything about a third
  party's scoring stability from our side. **Mitigated, not resolved,
  2026-09-10:** NEXT_ACTIONS.md #10 shipped `--site-type content`, which
  excludes API-surface checks from scoring — but only for scanners that
  expose per-check point weights (afdocs, Ora). `is-agentic` never does (its
  `checks[]` only lists non-passing issues, no per-check weight), so its own
  `score.overall` is still NOT adjusted by `--site-type` — the excluded
  checks are listed under "Not applicable for this site type" for visibility
  but keep counting toward is-agentic's number. So the volatility this entry
  describes is unchanged for `is-agentic` specifically; `--site-type content`
  against `ora` directly (the same engine, full ranker) does get the real
  fix. Left open because the underlying third-party volatility — and the
  is-agentic score-adjustment gap — aren't actually resolved.
- **`scan-local`/`rescan-local`/`loop` can under-report a fixer's platform-side fixes.** Cloudflare
  Pages and Vercel/Next.js run their real platform runtime locally (`wrangler pages dev`, `next
  start`), so their Pages Functions/Edge Middleware are exercised the same as a real deploy. Every
  other platform (Netlify, GitLab Pages, and any future generic fallback) falls back to a plain
  `node:http` static-file server, which serves file content only — it never executes a platform's
  edge runtime. Confirmed concretely for Netlify: `applyNetlifyFixes` writes a markdown-negotiation
  Edge Function under `netlify/edge-functions/` that only Netlify's own deploy target runs, so the
  `content-negotiation`/`markdown-negotiation-vary` check reads as failing in a local scan even
  after `enhance`, and would only show as fixed against the real deployed URL. Structural, not a
  bug — a generic static server has no way to run a platform's edge functions. Mitigated
  2026-09-12: `src/loop.js`'s `localScanCaveatFor` surfaces this in `onProgress` output and as
  `report.localScanNote` (rendered in report.md/json) whenever the detected platform isn't
  Cloudflare Pages or Vercel, so it reads as a known local-scan gap rather than a failed fix. Not
  resolved beyond that — there's no way to actually run Netlify's edge runtime locally short of a
  real Netlify CLI dev server, which is out of scope (see "CLI/API/MCP over UI scraping" — same
  principle: no bespoke per-platform tooling beyond what already exists).
