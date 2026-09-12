# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.12.0`, **not yet committed/pushed or published to npm**.

---

## Right Now

No blocker. 2026-09-12 (latest session): new goal set by Daniel — support as
many framework/platform combos as possible with **zero new accounts/auth**,
broken into NEXT_ACTIONS.md #20-#24. Shipped #20 (generic `node:http`
static-file local-server fallback for any non-cloudflare-pages/vercel
platform, replacing the old "throw if unsupported" behavior — no new
dependency, path-traversal-safe, verified with `verify-loop`) and #21
(Netlify fixer: `src/platforms/netlify.js` writes a
`netlify/edge-functions/markdown-negotiation.js`, same `.md`-negotiation
pattern as the Cloudflare/Vercel fixers; wired into `enhance.js` +
`detect-stack.js`). Verified idempotent on a synthetic astro+netlify.toml
repo; `npm run verify-loop` still green. Full detail: WORKLOG.md `v1.12.0`.
Not yet committed — review the diff and commit/push next.

Earlier session: new Jekyll + GitHub Pages fixer
(`src/fixers/jekyll.js` + `src/platforms/github-pages.js`), committed,
pushed, and verified against the live site — afdocs 0 → 72 (C). A first
attempt also fixed `markdown-url-support` via a split-file markdown mirror;
reverted after review flagged the two-files-drift-out-of-sync risk — not
worth it for one check. NEXT_ACTIONS.md #18 has the full writeup, #19 is a
new open item (is-agentic failing to fetch this site's homepage — confirmed
scanner-side, not a real issue). Full detail: WORKLOG.md `v1.11.0`.

Earlier same-day session: renamed `examples/` to `fixtures/` — it never
shipped to npm and no usage doc pointed a user at it, so the name was
misleading; it's really `verify-loop.js`'s CI/dev fixture dir. All path refs
+ each fixture's own package name updated. `npm run lint`/`verify-loop`
pass. Full detail: WORKLOG.md `v1.10.1`.

Earlier: `scan-local` command (v1.10.0), `install-skill` command +
`write-report.js` dedup (v1.9.0), astro-starlight fixer gaps (v1.8.0), npm
publish + docs site (v1.7.0) — full detail in WORKLOG.md under each version.

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
