# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.14.0`, committed, tagged, and published to npm.

---

## Right Now

No blocker. 2026-09-12 (latest session): traced Quick Tunnel's DNS-flap failure to *spacing between
tunnel creations*, not per-attempt delay (6/6 success at 4min gaps vs. 5/5 failure back-to-back; a
10s inter-attempt cooldown still failed 3/3). `src/lib/tunnel.js` now refuses a new tunnel under a
2min gap since the last one (persisted across CLI invocations) — an honest known-bad-zone filter,
not a proven-safe threshold, with a rolling-count warning near the observed ~20/hour rate limit.
Retry loop no longer burns attempts back-to-back on the specific DNS-flap failure (a bug this
session's own review caught). **Then removed the `loop` command entirely** (no deprecation, no real
users yet) — its whole premise was exactly the back-to-back-tunnel pattern just proven unreliable.
`scan-local` → `enhance` → `rescan-local`, run as three separate commands, is now the only path;
every doc (README, docs/, SKILL.md, AGENTS.md, CONTRIBUTING.md) and `scripts/verify-loop.js` updated
accordingly. `npm run verify-loop` green. **v1.14.0**, committed, tagged, pushed, released on
GitHub, published to npm. Next session: verify the guard against a real `is-agentic` scan once
Cloudflare's rate limit cools down, then revisit #19's actual subfolder-URL hypothesis (still
unresolved). Full detail: WORKLOG.md `v1.14.0` and the two `2026-09-12` entries above it.

Round two (same day, earlier): ruled out `tunnel.js`'s client and the local network as causes of the
DNS flap; found `cloudflared`'s healthy-precheck banner isn't a public-URL-ready signal. Full detail:
WORKLOG.md `2026-09-12 — Quick Tunnel reliability, round two`.

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
