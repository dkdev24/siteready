# AGENTS.md

Instructions for AI agents (Claude Code, OpenCode, and others) working in this repo.

## System Documents

Two documents maintain cross-session state. Read them at the start of every session. Update them at the end.

### HANDOFF.md

- Location: `HANDOFF.md`
- Purpose: Cross-session context memory.
- Contains: current version, project status, last session summary, next actions, open issues, key paths.
- **Read at the start of every session.**
- **Update at the end of every session.** Replace the Last Session and Next Actions sections. Append to Open Issues as needed.

### WORKLOG.md

- Location: `WORKLOG.md`
- Purpose: Persistent project history.
- Contains: one entry per version milestone, with date, changes, and status.
- **Do not load at session start.** Read only when version history is directly relevant to the current task.
- **Append a new entry when a version milestone is reached.** Never edit past entries.
- Version format: `x.x.x` — increment the patch for small changes, minor for new subsystems, major for engine-complete milestones.

## Project Notes

- `siteready` is a CLI tool: scan a site with multiple agent-readiness scanners, normalize
  results into one scorecard, auto-fix supported issues, re-scan, and diff. See README.md
  for usage and CONTRIBUTING.md for how to add new scanners/fixers.
- Run `node scripts/check-syntax.js` (aliased as `npm run lint`) and `node scripts/verify-loop.js`
  (`npm run verify-loop`) before committing changes to core logic.
