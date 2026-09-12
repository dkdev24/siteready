# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.14.0`, committed, tagged, and published to npm.

---

## Right Now

No blocker. 2026-09-12, latest: **`loop` command restored** — since the precheck fix below makes
two back-to-back Quick Tunnels no less reliable than one, the reason `loop` was removed (v1.14.0)
no longer holds. `src/loop.js`/`src/cli.js` bring back `runLoop`/`loop` as an opt-in single-shot
`scan-local → enhance → rescan-local`, alongside the three-separate-commands path as the still-
recommended default (SKILL.md updated accordingly). Verified: a real run with `--scanners
is-agentic` opened two tunnels back-to-back, both reachable on attempt 1/3. Not committed yet.

Just before that, **#19 resolved** — `is-agentic`'s "could not fetch homepage" is confirmed to be a
scanner-side bug on subfolder URLs (clean 70/100 scan once tested against a domain-root proxy of
the same content), not fixable from siteready. Found via the same fix: probing was starting before
it was safe to — now gated on cloudflared's own "precheck complete hard_fail=false" line
(`waitForPrecheck`), which made the tunnel reachable on the first attempt instead of failing
repeatedly. Committed as `d1fed70`/`5d21ed1`.

Earlier same day (all superseded by the precheck fix above, kept as pointers only — full chase in
WORKLOG.md "Quick Tunnel reliability, round two"/"round three"/"min-gap guard was solving the wrong
problem"): chased the same DNS-reachability problem through a spacing theory (min-gap guard,
shipped then reverted), a rate-limit theory, and a raised timeout, before landing on the real cause
above. Also **removed the `loop` CLI command entirely** (no deprecation, no real users yet) since
its design was the back-to-back-tunnel pattern this chase was investigating —
`scan-local` → `enhance` → `rescan-local`, three separate commands, is now the only local path.
Shipped as **v1.14.0**, committed, tagged, pushed, released, published to npm.

Earlier same-day: goal set by Daniel — support as many framework/platform combos as possible with
**zero new accounts/auth** (NEXT_ACTIONS.md #20-#24). `v1.12.0` (#20 generic static-server
fallback, #21 Netlify fixer) and `v1.13.0` (#22 GitLab Pages platform module) both committed,
tagged, released, published to npm. Full detail: WORKLOG.md `v1.12.0`/`v1.13.0`.

Earlier: Jekyll + GitHub Pages fixer (v1.11.0, verified live — afdocs 0 → 72),
`examples/`→`fixtures/` rename (v1.10.1), `scan-local` (v1.10.0), `install-skill` +
`write-report.js` dedup (v1.9.0), astro-starlight fixer gaps (v1.8.0), npm publish + docs site
(v1.7.0) — full detail in WORKLOG.md under each version.

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
