# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.16.1`, committed, tagged, and published to npm.

---

## Right Now

No blocker. 2026-10-17, **v1.16.0**: the Cloudflare Pages and Netlify markdown-negotiation
templates treated every markdown-preferring or AI-bot request as a page request, so `.md` URLs
(`page.md.md` lookup), `robots.txt`, `sitemap.xml` and nested `llms*.txt` indexes returned the
`/404.md` mirror (404) to agents. Found on a real production docs site whose agent sessions fell
back to HTML. Templates now skip paths with a file extension; `Claude-User` added to `BOT_UA`.
**Sites that already ran `enhance` keep the old middleware** (enhance never overwrites); the
release notes tell them to patch or delete and re-run.

New default scanner **`agent-headers`** (in-house, plain fetch): requests every URL kind
`llms.txt` links to (one level of nested `llms*.txt`) with real agent headers and
`redirect: "manual"`, fails on an error status or an off-path redirect. afdocs/is-agentic test
one header pattern per URL type and follow redirects, so they passed the broken middleware.
Regression check `scripts/check-agent-headers.js` (in `npm run lint`) runs the generated CF
middleware; `verify-loop` asserts no agent-headers failure after enhance. Detail: WORKLOG v1.16.0.

v1.16.1 (same day): afdocs pin 0.20.0 → 0.22.2, closes #1 (schema-compatible, 5 new checks).

**#15 still open, not done** — the partial-report fix itself is unstarted.

Next up: #2 (real-deploy score-movement verification, folds in #7's Ora
residual) is the top open item in NEXT_ACTIONS.md.

Settled, don't reopen: internal refs in git history accepted as-is (#11,
AGENTS.md). siteready is a **tool** not a skill — `SKILL.md` never
implements behavior (AGENTS.md rule 1).

---

## Where To Look

| Doc | Contains |
|---|---|
| `NEXT_ACTIONS.md` | Open TODOs, numbered |
| `ISSUES.md` | Known open issues not yet actioned |
| `WORKLOG.md` | Full project history — one entry per session, milestone or not |
| `README.md` | Short pitch + quickstart, links to the full docs site |
| `docs/` | Full docs site (install, CLI reference, why, architecture) — published at https://dkdev24.github.io/siteready/ |
| `AGENTS.md` | Key paths, standing development rules |

---

## Session-Start Checklist

1. Read this file.
2. Skim `NEXT_ACTIONS.md` #0 and `ISSUES.md` for anything blocking.
3. Open `WORKLOG.md` only if you need full history behind a past decision.
