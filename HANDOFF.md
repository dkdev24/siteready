# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.21.0` (2026-10-31: SvelteKit + Cloudflare Pages fixer, #29; tagged `v1.21.0`,
published to npm; WORKLOG v1.21.0). 1.20.0 (2026-10-26: engines `>=22`, CI on Node 24; tagged +
GitHub release). 1.19.3 was published, tagged and pushed (2026-10-17). 1.19.0-1.19.2 are `npm deprecate`d (OpenNext mirror bug, see below).

---

## Right Now

No blocker. 2026-10-31 (docs site AEO pass, no bump): new `docs/faq.md` (8 Q&As) + FAQPage JSON-LD conditional on `/faq.html` and SoftwareApplication JSON-LD on `/` in `head-custom.html`; `docs/llms.txt` stub replaced with a real index (page list + "when to use this"); comparison table added near the top of `docs/why.md`; `Sitemap:` appended to `docs/robots.txt`; `docs/404.md` Home link fixed to `relative_url`. `npm run lint` passes (8/8). Committed locally, not pushed. Open: og:image still missing (needs image design).
2026-10-31 (docs site, no bump): fixed duplicate `{% seo %}` — `docs/_includes/head-custom.html:1` and `docs/_layouts/default.html:11` both rendered it (live: 2× title/description/canonical/JSON-LD on every page); removed from the include, the layout keeps it. `npm run lint` passes (8/8). Committed locally, not pushed.
2026-10-17, **v1.16.0**: the Cloudflare Pages and Netlify markdown-negotiation
templates treated every markdown-preferring or AI-bot request as a page request, so `.md` URLs
(`page.md.md` lookup), `robots.txt`, `sitemap.xml` and nested `llms*.txt` indexes returned the
`/404.md` mirror (404) to agents. Found on a real production docs site whose agent sessions fell
back to HTML. Templates now skip paths with a file extension; `Claude-User` added to `BOT_UA`.
**Sites that already ran `enhance` keep the old middleware** (enhance never overwrites); the
release notes tell them to patch or delete and re-run.

New default scanner **`agent-headers`** (in-house, plain fetch): requests every URL kind
`llms.txt` links to (one level of nested `llms*.txt`) with real agent headers and
`redirect: "manual"`, fails on an error status or an off-path redirect. afdocs/is-agentic test
one header pattern per URL type and follow redirects, so they passed the broken middleware.
Detail: WORKLOG v1.16.0.

v1.16.1 (same day): afdocs pin 0.20.0 → 0.22.2, closes #1 (schema-compatible, 5 new checks).
**v1.17.0** (same day): Starlight `.md` mirror runs the body through `toAgentMarkdown()`
(`src/lib/md-mirror.js`): absolute links, components → markdown. Existing raw-body routes get a
warning (enhance never overwrites). Regression check `scripts/check-md-mirror.js` in lint.

**v1.19.x** (2026-10-17, published): never wire the mirror generator on OpenNext (public/ → S3 behaviors 403; 1.19.0–1.19.2 deprecated on npm); generator writes mirrors at canonical path + `.md`; `scan-local` sends only hosted scanners through the tunnel. Detail: WORKLOG v1.19.x.
**v1.18.0** (2026-10-17, uncommitted): monorepo path detection + `aws-cloudfront-opennext` platform. Detail: WORKLOG v1.18.0.

**#15 still open, not done** — the partial-report fix itself is unstarted.
2026-10-25 (docs site, no bump): GA `G-8EB1Z0RX3W` behind a consent banner (`docs/_includes/head-custom.html`, key `siteready-consent`) + `/privacy/`; Pages build and GA Realtime confirmed live. WORKLOG.

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
