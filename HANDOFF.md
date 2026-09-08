# HANDOFF.md

Cross-session context memory. Update this file at the end of every session.

---

## Current Version

**1.0.0**

---

## Project Status

siteready is a CLI orchestration + remediation layer for "agent-readiness" website
scanning. It runs a site through multiple scanners (afdocs, Vercel Is Agentic),
normalizes results into one scorecard, auto-fixes issues its fixers support
(currently Astro + Starlight + Cloudflare Pages), then re-scans and produces a
before/after diff — fully local, no live deployment required. v1.0 is complete:
scan/enhance/rescan/diff-report loop works end-to-end, CI passes on Windows/macOS/
Linux, and the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site
from 0/100 (F) to 97/100 (A) on afdocs.

---

## Last Session

Ran `/project-init` to add cross-session agent infrastructure (HANDOFF.md,
WORKLOG.md, AGENTS.md, CLAUDE.md). GitHub repo (`dkdev24/siteready`, private) and
`.gitignore` were already correctly set up from prior sessions, so this session
only added the system documents and committed/pushed them.

---

## Next Actions

1. Add fixers for additional frameworks/platforms as demand comes in (see
   CONTRIBUTING.md for the fixer contribution process).
2. Consider expanding scanner coverage beyond afdocs + Vercel Is Agentic.

---

## Open Issues

- None currently tracked.

---

## Key Paths

| Path | Purpose |
|---|---|
| `src/cli.js` | CLI entrypoint (scan / enhance / rescan / diff-report / loop) |
| `src/scan.js`, `src/scanners/` | Scanner orchestration (afdocs, is-agentic) |
| `src/enhance.js`, `src/fixers/` | Framework/platform detection + auto-fixers |
| `src/report.js`, `src/diff-report.js` | Scorecard normalization + before/after diffing |
| `src/loop.js` | Full local scan→enhance→rescan→diff-report loop |
| `examples/astro-starlight-cf-pages/` | Reference fixer target + reproduction steps |
| `scripts/verify-loop.js` | CI verification of the full loop |
| `siteready-plan.md` | Original design/planning doc |
