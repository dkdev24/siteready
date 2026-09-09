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
- **Scanner scores don't see broken navigation.** A real production docs site
  scored 72/100 (D) on `is-agentic` and 97/100 (A) on `afdocs` while its
  homepage shipped a dead product card and every shortened URL guess returned
  a hard 404 — the two failures that actually stopped an agent from completing
  its task on that site. What surfaced them was the Ora *journey narrative*
  ("had to work around a fragmented doc structure; many 404s on
  breadcrumb-suggested paths forced the agent to rely on web search to
  discover the actual working endpoint URLs"), not any check in any of the
  three scorecards. Implication for siteready: the numeric roll-up is not a
  sufficient output. `ora.js` currently normalizes per-check results and drops
  the prose; the journey text is the highest-signal thing the Ora API returns
  and should be surfaced in `report.md` verbatim, not summarized into a score.
  Related: NEXT_ACTIONS.md #16 (near-miss path resolution) and #17 (links in
  MDX component props) both came out of that narrative rather than out of a
  failing check.
