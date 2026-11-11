# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.22.1` (2026-11-11: afdocs 0.23.0 pin + fixture undici bump; tagged, released, on npm). 1.22.0 (2026-11-10: .md-sibling duplicate check + fixer, #30; pushed, tagged, GitHub release, published to npm 2026-11-11 — built from the tag, so it ships afdocs 0.22.2). 1.21.0 (2026-10-31: SvelteKit + Cloudflare Pages fixer, #29; tagged `v1.21.0`,
published to npm). 1.20.0 (2026-10-26: engines `>=22`, CI on Node 24; tagged +
GitHub release). 1.19.3 was published, tagged and pushed (2026-10-17). 1.19.0-1.19.2 are `npm deprecate`d (OpenNext mirror bug, see below).

---

## Right Now

2026-11-12 (code scanning, no version bump, `1696201`): fixed 3x `js/incomplete-sanitization` (pipe escape in `src/templates/{next,sveltekit}-agent-readiness.mjs` + `fixtures/nextjs-vercel/scripts/agent-readiness.mjs`: now `.replace(/[\\|]/g, "\\$&")`, escapes backslash too) and `ci.yml` `permissions: contents: read`. `npm run lint` passes; alerts close after the push + CodeQL re-scan. Same pattern fixed in pele-animate's script.
No blocker. 2026-11-11 (undici 8.10.2→8.12.4, no version bump): fixed 8 open Dependabot alerts (#65, #64, #63, #62, #61, #23, #22, #21 — all undici, transitive via unifont) in `fixtures/astro-cf-pages/package-lock.json` via `npm update undici`; no override needed (`^8.0.0` range). Other fixture lockfiles already ≥8.12.2. `npm run lint` 8/8, full verify-loop green on all 5 fixtures. No npm publish — fixture-only (1.22.0 = npm `latest`, same tarball). Detail: WORKLOG 2026-11-11.
2026-11-10 (v1.22.0, #30, shipped 2026-11-11): new `md-duplicate-signal` check in agent-headers + platform fixers (`_headers` for CF Pages/Netlify, `vercel.json` for Vercel, warning-only for CloudFront/OpenNext, report-only for GitHub/GitLab Pages). Found + fixed `extractLinks` missing bare `.md` paths in Starlight-format llms.txt. New fixture `astro-md-duplicates-cf-pages`, verify-loop case flips fail→pass. `npm run lint` 8/8, full verify-loop green on all 5 fixtures. Live scans: docs + SvelteKit sites pass the check; story site's llms.txt lists no .md (check skips) but 10/10 sampled .md URLs carry noindex. Detail: WORKLOG v1.22.0.
2026-11-06 (verify-loop symlink fix, no version bump): `scripts/verify-loop.js` now copies fixture trees with `verbatimSymlinks: true` — the default rewrote `.bin` relative symlinks as absolute paths into the source tree, causing duplicate-React `useContext`-null prerender crashes on nextjs-vercel; full verify-loop green on all fixtures after the fix. Detail: WORKLOG 2026-11-05.
2026-11-06 (dependabot #14/#15 merged, no version bump): per Daniel's "test then merge", squash-merged #14 (sharp 0.35.4→0.35.5) and #15 (devalue 5.9.2→5.9.4), both lockfile-only in `fixtures/astro-cf-pages`. Tested on temp branch first: `npm run lint` 8/8 pass; `npm run verify-loop` astro-cf-pages OK; GitHub CI 3 OS all pass on both PRs. No npm publish — fixture-only (1.21.0 = npm `latest`, same tarball). No open dependabot PRs left. Detail: WORKLOG 2026-11-06.
2026-11-05 (dependabot #13 merged, no version bump): per Daniel's "test then merge", squash-merged #13 (vite 8.2.2→8.3.5, fixtures/astro-cf-pages, lockfile-only) after testing on temp branch: `npm run lint` 8/8 pass; `npm run verify-loop` astro-cf-pages verified OK (afdocs baseline 41/100 → http-status-codes + content-negotiation fail→pass, agent-headers 100/100; same vite 8.3.5 already verified via PR #7, no new risk); GitHub CI 3 OS all pass. No npm publish — fixture-only (1.21.0 = npm `latest`, same tarball). New finding: nextjs-vercel verify-loop failure root cause identified — `scripts/verify-loop.js`'s `fs.cp` copies `.bin` symlinks as absolute paths, so the tmp tree loads `next` from source tree + `react` from tmp tree → duplicate React → useContext-null prerender crash; only when fixture node_modules pre-installed; PR-unrelated. Detail: WORKLOG 2026-11-05.
2026-11-03 (dependabot #9/#10 merged, no version bump): per Daniel's "test then merge", squash-merged #9 (sharp 0.35.4→0.35.5, fixtures/astro-starlight-cf-pages, package.json + lockfile) and #10 (zod 4.5.4→4.6.7, fixtures/astro-cf-pages, lockfile-only). `npm run lint` 8/8 pass; `npm run verify-loop` pass on touched fixtures; GitHub CI 3 OS all pass on both PRs. No npm publish — fixtures aren't shipped (1.21.0 = npm `latest`, same tarball). Issue #11 (Scanner CLI drift) left alone (deliberate). No open dependabot PRs left. Detail: WORKLOG 2026-11-03.
2026-10-31 (docs site AEO pass + duplicate {% seo %} fix, no bump): new `docs/faq.md` (8 Q&As) + FAQPage JSON-LD conditional on `/faq.html` and SoftwareApplication JSON-LD on `/` in `head-custom.html`; `docs/llms.txt` stub replaced with a real index; comparison table in `docs/why.md`; `Sitemap:` in `docs/robots.txt`; `docs/404.md` Home link fixed. Also removed duplicate `{% seo %}` (include + layout both rendered it). `npm run lint` passes (8/8). Committed locally, not pushed. Open: og:image still missing (needs image design).
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
2026-11-11: afdocs pin 0.22.2 → 0.23.0, closes #11 (verify-loop green, live scan identical). Released in 1.22.1.
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
