# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.14.0`, committed, tagged, and published to npm.

---

## Right Now

No blocker. 2026-09-12, latest finding: the "spacing between tunnel creations causes DNS flap"
theory below (v1.14.0's min-gap guard) was **wrong** — Daniel got 5/5 real tunnels reachable
back-to-back, under 30s apart. Measured the real cause: per-hostname DNS propagation delay is just
erratic (5s–60s+, no SLA), and each Quick Tunnel's independent random hostname has no shared DNS
state with the last one, so spacing between creations can't affect it. `src/lib/tunnel.js`: removed
`MIN_GAP_MS`/the gap-refusal check/the `reachabilityFlap` early-abort; raised `waitForReachable`'s
timeout 30s→60s. `npm run verify-loop` green. Not committed yet. Still best-effort infra — a
same-session re-check still failed 3/3, likely from ~15-20 tunnels already burned this hour, a
quota effect not a flaw in the fix. Full detail: WORKLOG.md "min-gap guard was solving the wrong
problem".

Earlier same day (superseded reasoning, kept for context): traced the DNS-flap failure to spacing
(6/6 success at 4min gaps vs. 5/5 failure back-to-back — the confound above wasn't caught yet),
shipped the min-gap guard on that basis, then **removed the `loop` command entirely** (no
deprecation, no real users yet) since its whole premise was the back-to-back-tunnel pattern that
looked unreliable. `scan-local` → `enhance` → `rescan-local`, three separate commands, is now the
only path; every doc and `scripts/verify-loop.js` updated accordingly. **v1.14.0**, committed,
tagged, pushed, released on GitHub, published to npm. (The `loop` removal itself still stands —
independent of the spacing misdiagnosis.)

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
