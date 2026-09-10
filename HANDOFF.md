# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 50 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.7.0`, not yet tagged in git.

---

## Right Now

No blocker. **NEXT_ACTIONS.md #15, #14, #10 all done** (2026-09-10, same
session): #15 — a failing scanner no longer aborts the whole scan. #14 — new
`compare`/`monitor` CLI commands. #10 — `--site-type content|api|application`
excludes API-surface checks from scoring; ships as a conservative subset (the
Payments layer + the checks ISSUES.md's volatility entry named), grounded in
Ora's live `/api/checks` catalog, not a full classification of all ~184
checks. Known gap: only `afdocs`/`ora` expose per-check weights to actually
recompute the score — `is-agentic`'s own score is NOT adjusted (see
ISSUES.md, kept open not resolved). See WORKLOG.md v1.5.1 / v1.6.0 / v1.7.0.

Next up: nothing queued — all three requested items shipped this session.

Settled, don't reopen: internal references in git history are accepted as-is
(#11) — no rewrite. New writing still avoids them (AGENTS.md).

Identity settled: siteready is a **tool**, not a skill — `SKILL.md` is a thin
adapter, never implements behavior (AGENTS.md rule 1). Package is publishable
but **unpublished**, so README's `npm install -g` isn't true yet (#12).

---

## Where To Look

| Doc | Contains |
|---|---|
| `NEXT_ACTIONS.md` | Open TODOs, numbered |
| `ISSUES.md` | Known open issues not yet actioned |
| `WORKLOG.md` | Full project history — one entry per session, milestone or not |
| `README.md` | Status table, architecture, design notes |
| `AGENTS.md` | Key paths, standing development rules |

---

## Session-Start Checklist

1. Read this file.
2. Skim `NEXT_ACTIONS.md` #0 and `ISSUES.md` for anything blocking.
3. Open `WORKLOG.md` only if you need full history behind a past decision.
