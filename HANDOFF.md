# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 50 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.5.1`, not yet tagged in git.

---

## Right Now

No blocker. **NEXT_ACTIONS.md #15 done** (2026-09-10): a failing scanner
(e.g. Ora 429) no longer aborts the whole scan — `scanTarget()` catches
per-scanner, `report.json` records the failure as `{ error }` with a
top-level `partial: true`, `diff-report` treats it as not-comparable instead
of crashing. See WORKLOG.md v1.5.1.

In progress this session: **#14** (multi-site compare + score-over-time
tracking), then **#10** (site-type filtering) — both queued next, no
blocker.

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
