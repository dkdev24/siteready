# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.11.0`, **not yet published to npm or tagged in git** (built
this session, see below).

---

## Right Now

**Open loop:** new Jekyll + GitHub Pages fixer (`src/fixers/jekyll.js` +
`src/platforms/github-pages.js`) built 2026-09-11, verified locally
(idempotent `enhance .` dry-run against this repo's own `docs/` site) but
**not yet committed, pushed, or verified live** — NEXT_ACTIONS.md #17 is the
live-rescan verification step, #18 has the full build writeup. Full detail:
WORKLOG.md `v1.11.0`.

Earlier same-day session: renamed `examples/` to `fixtures/` — it never
shipped to npm and no usage doc pointed a user at it, so the name was
misleading; it's really `verify-loop.js`'s CI/dev fixture dir. All path refs
+ each fixture's own package name updated. `npm run lint`/`verify-loop`
pass. Full detail: WORKLOG.md `v1.10.1`.

Earlier same-day session shipped `scan-local` — new CLI command
(`runScanLocal` in `src/loop.js`, reuses `loop`'s build/serve/tunnel
machinery) so a repo checkout can get a baseline scan before its first
public deployment, no URL required. Full detail: WORKLOG.md `v1.10.0`.

Earlier same-day session shipped `install-skill` — new CLI
command (`src/skill-install.js` + `src/installers/`) so `siteready` can
install its own `SKILL.md` into Claude Code, Codex CLI, and OpenCode's
skill-discovery paths (`--global`/`--force`/`--uninstall`, npx-cache
warning). Fixed a pre-existing `package.json` `files` gap along the way —
`docs/` wasn't shipped to npm, so `SKILL.md`'s doc links 404'd for npm
installs. A ponytail-audit pass also landed: 4 duplicated `write*Report`
functions collapsed into `src/lib/write-report.js`'s `writeJsonAndMarkdown`
helper (the `--site-type api`/`application` no-op finding was left as-is —
removing it breaks a documented, released public flag). `npm run
lint`/`verify-loop` pass. Full detail: WORKLOG.md `v1.9.0`.

Earlier same-day session (astro-starlight fixer gaps ported from docs-starlight)
and 2026-09-10 session (npm publish, docs site, README trim): full detail in
WORKLOG.md `v1.8.0`/`v1.7.0`.

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
