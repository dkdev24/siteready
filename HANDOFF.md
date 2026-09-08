# HANDOFF.md

Cross-session context memory. Update this file at the end of every session.

---

## Current Version

**0.2.0** (doc-tracking system's own version — see WORKLOG.md; the underlying
CLI/engine remains at package.json's `1.0.0`, tagged `v1.0.0` in git)

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

Wrote `SKILL.md` (repo root) so siteready can be driven as a Claude Code skill,
not just a raw CLI — added "Standing Development Rules" to AGENTS.md pulled from
README/plan first. Sanity-checked the skill with 3 fresh subagents against
realistic prompts (URL-only scan, "fix it" with no local checkout, local checkout
+ explicit "commit it" request) — all three followed the decision table correctly
(right command chosen, `enhance` correctly withheld without a local checkout,
never auto-committed). Found and fixed one real gap: SKILL.md didn't say how to
handle a scan where checks report "failed to fetch" (unreachable/typo'd domain)
vs. a genuine low score — added guidance to report that as "couldn't reach the
site," not as a real finding. Also fixed a cwd-assumption bug: the first draft
assumed commands run from inside the siteready repo, which breaks once installed
at user level and invoked from an arbitrary target project — rewrote commands to
use `<skill-dir>` (the skill's own base directory) for the CLI entrypoint while
keeping path *arguments* relative to the target project's own cwd. Installed the
skill at user level: `~/.claude/skills/siteready` is now a symlink to this repo
(same pattern as the existing `agent-browser`/`find-skills` symlinked skills).
`siteready-plan.md` updated (update 10) to record this work. Confirmed the repo
is already public (flipped during the v1.0.0 launch, per plan update 9) — nothing
outstanding there.

---

## Next Actions

1. Test the installed skill against a real, unrelated website project (the
   original ask behind installing it at user level) — confirm it triggers
   correctly and the `<skill-dir>`-relative commands actually work end-to-end
   outside this repo, not just in the sanity-check subagents.
2. Add fixers for additional frameworks/platforms as demand comes in (see
   CONTRIBUTING.md for the fixer contribution process).
3. Consider expanding scanner coverage beyond afdocs + Vercel Is Agentic.
4. Consider running SKILL.md's description through skill-creator's trigger-eval
   optimizer (`references/schemas.md` / description-optimization loop) once it's
   seen more real-world use — skipped this session as premature.

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
| `SKILL.md` | Claude Code skill entrypoint — orchestration instructions for running siteready as an agent, cwd-agnostic (uses `<skill-dir>`) |
