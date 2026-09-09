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
  party's scoring stability from our side, but siteready can stop counting
  checks that don't apply to the site's type in the first place — see
  NEXT_ACTIONS.md #10 (site-type filtering).
