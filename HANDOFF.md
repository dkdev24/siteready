# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 50 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.7.0`, published to npm, not yet tagged in git.

---

## Right Now

No blocker. 2026-09-10 session (see WORKLOG.md for full detail on each):
**#12 done** — `siteready@1.7.0` published to npm (`danielkimdev`), `npx
siteready`/`npm install -g siteready` work for real now. **#16 done** —
`docs/` (plain Jekyll) live at https://dkdev24.github.io/siteready/.
**README trimmed** 421 → ~145 lines, detail moved to `docs/why.md`,
`docs/architecture.md`, `docs/install.md` (links out, not duplicated); live
cross-refs in SKILL.md/AGENTS.md/CONTRIBUTING.md updated to match. **Voice
pass** on the pitch prose (README intro/Why, `docs/why.md`, `docs/index.md`)
per Daniel's writing-style skill — stripped every em-dash/semicolon, checked
colon density rather than relocating the tell.

**#15 still open, not done** — only the decision to document (not patch)
the scanner-failure gap shipped in v1.5.1; the partial-report fix itself is
unstarted (corrected here 2026-09-10 after a stale "done" claim).

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
