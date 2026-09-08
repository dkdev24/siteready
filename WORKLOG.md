# WORKLOG.md

Persistent project history. Append entries; do not edit past entries.

---

## v0.1.0 — Repository Initialization

**Date:** 2026-09-08

### Changes

- Added cross-session agent infrastructure: HANDOFF.md, WORKLOG.md, AGENTS.md,
  CLAUDE.md.
- Confirmed GitHub repo (`dkdev24/siteready`, private) and `.gitignore` were
  already correctly set up from prior work (v0.4 initial commit through v1.0.0).

### Status

Project management documents now in place; engine itself is already at v1.0
(see README.md / git history for engine milestones prior to this doc-tracking
system).

---

## v0.2.0 — SKILL.md + User-Level Skill Install

**Date:** 2026-09-08

### Changes

- Added `SKILL.md` (repo root) so siteready can be driven as a Claude Code skill:
  a command decision table (scan vs. enhance vs. rescan vs. diff-report vs. loop),
  the `enhance`-needs-a-local-checkout precondition, the never-commit/never-overwrite
  safety rules, and pointers to README/CONTRIBUTING/AGENTS for depth.
- Added a "Standing Development Rules" section to AGENTS.md (npx-runner.js
  requirement, pinned scanner CLI versions, non-zero-exit-is-expected behavior,
  additive-plugin contract, cross-platform gotchas) sourced from README.md and
  siteready-plan.md.
- Sanity-checked SKILL.md with 3 fresh subagents against realistic prompts;
  fixed one real gap (distinguishing "failed to fetch" from a genuine low score)
  and one correctness bug (commands assumed cwd = siteready repo, which breaks
  once installed at user level — fixed to use `<skill-dir>` for the CLI
  entrypoint with cwd-relative path arguments).
- Installed the skill at user level: `~/.claude/skills/siteready` symlinked to
  this repo, so it's available across all projects, not just this one.
- `siteready-plan.md` updated (update 10) to record the SKILL.md work.

### Status

siteready is now usable both as a plain CLI and as an installed Claude Code
skill triggerable from any project. Not yet verified against a real external
website project end-to-end (only sanity-checked via subagents) — see
HANDOFF.md Next Actions.
