# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 50 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.7.1** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.3.1`, not yet tagged `v1.3.1` in git.

---

## Right Now

Top blocker: **NEXT_ACTIONS.md #0** — `loop`'s Cloudflare Quick Tunnel support
for hosted scanners (`src/lib/tunnel.js`) tested unreliable: 1 success in 4
attempts, DNS failures on `*.trycloudflare.com`. Choose retry-with-a-fresh-
tunnel, a named/authenticated tunnel, or rollback. Don't describe
hosted-scanner `loop` support as shipped until resolved.

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
