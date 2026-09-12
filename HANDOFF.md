# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.13.0`, committed, tagged, and published to npm.

---

## Right Now

No blocker. 2026-09-12 (latest session): retested Quick Tunnel reliability for #19's
subfolder-proxy investigation (dropped 2026-09-11). Still blocked, but traced further than "flaky
infra": ruled out `tunnel.js`'s client (`curl` vs Node `fetch()` always agree) and the local
network (Cloudflare's own 1.1.1.1/8.8.8.8 disagree with each other on a fresh
`*.trycloudflare.com` hostname — the flap is at Cloudflare's own anycast DNS). Also found
`cloudflared`'s "Environment is healthy" precheck isn't a public-URL-ready signal (it checks
internal `argotunnel.com` hosts, stays green even when the public hostname never resolves), and
hit Quick Tunnel's per-IP creation rate limit (429/1015) after ~20 tunnels/hour. Open question for
next session in NEXT_ACTIONS.md #19: does a human-realistic delay before the first check reliably
dodge the flap? No code changed. Full detail: WORKLOG.md `2026-09-12 — Quick Tunnel reliability,
round two`.

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
