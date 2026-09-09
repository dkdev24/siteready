# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 50 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.10.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.5.0`, not yet tagged in git.

---

## Right Now

No blocker. Hosted-scanner `loop` via Quick Tunnel: shipped (v1.4.0).
v1.4.1 fixed two defects dogfooding found in our own fixer output (middleware
collision guard, flat `llms.txt`). v1.5.0 shipped both remaining dogfooding
finds: near-miss 404 resolution (`fixers/near-miss.js` — `/url-index.json` +
a 301 resolver in the CF middleware, live-verified via `wrangler pages dev`)
and `siteready lint` (`href`/`link` in component props and frontmatter,
checked against build output, exits non-zero). See WORKLOG.md.

Next up: **#2** (before/after score delta) and **#13** (Next.js + Vercel fixer
— the competitive gap).

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
