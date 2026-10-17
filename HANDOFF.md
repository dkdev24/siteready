# HANDOFF.md

Cross-session context memory. Update at the end of every session — keep this
file under 80 lines. Detailed history and lists live in the linked docs below.

---

## Current Version

**0.8.0** (doc-tracking system version, see WORKLOG.md). Engine/CLI is at
package.json `1.19.0`, **uncommitted, untagged, unpublished** (v1.17.0 is the last published).

---

## Right Now

No blocker. 2026-10-17, **v1.16.0**: the Cloudflare Pages and Netlify markdown-negotiation
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
Regression check `scripts/check-agent-headers.js` (in `npm run lint`) runs the generated CF
middleware; `verify-loop` asserts no agent-headers failure after enhance. Detail: WORKLOG v1.16.0.

v1.16.1 (same day): afdocs pin 0.20.0 → 0.22.2, closes #1 (schema-compatible, 5 new checks).
**v1.17.0** (same day): Starlight `.md` mirror runs the body through `toAgentMarkdown()`
(`src/lib/md-mirror.js`): absolute links, components → markdown. Existing raw-body routes get a
warning (enhance never overwrites). Regression check `scripts/check-md-mirror.js` in lint.

**v1.19.0** (2026-10-17, uncommitted, #25 done): the Next.js fixer now generates `llms.txt` + `.md` mirrors from the
build output (`scripts/agent-readiness.mjs` wired as `postbuild`; zero-dep, ownership-marked, never fails the build). Dogfood on
a real Next.js/pnpm/AWS monorepo, local: afdocs 41 → 89. Open: existing proxy skipped (#27), in-HTML directive (#28). Detail: WORKLOG v1.19.0.
**v1.18.0** (2026-10-17, uncommitted): monorepo path detection (npm/yarn/pnpm workspaces, up and
down) + `aws-cloudfront-opennext` platform for Next.js (CloudFront + OpenNext/SST/cdk-nextjs-standalone),
new fixture `nextjs-opennext-monorepo`, `scripts/check-detect-stack.js` in lint. Also narrowed-bug fix in
`fixers/nextjs.js` (skips existing nested/TS `not-found`, `app/robots.*`). Can't verify CloudFront cache
key or S3-served `public/*.md` locally; the fixer warns. Next: scan a real deployed Next.js-on-AWS site
as a test target (enhance on a copy only; an existing `proxy.ts` is skipped, not merged). Detail: WORKLOG v1.18.0.

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
