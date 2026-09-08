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

## Standing Development Rules

- **Scanners and fixers are additive plugins.** Adding a new scanner adapter (`src/scanners/`) or
  framework fixer (`src/fixers/` + `src/platforms/`) means new files only — never modify the
  contract or behavior of scanners/fixers already shipped.
- **Every scanner adapter must invoke its CLI through `src/lib/npx-runner.js`**, never its own
  `child_process` call. It resolves npm's `npx-cli.js` correctly across Windows/POSIX/Homebrew
  layouts, which a PATH-resolved `npx` can get wrong.
- **A scanner CLI exiting non-zero is expected, not a tool failure** — it means the scanned site
  failed checks (the normal case for a "before" baseline). Only a missing/unparseable stdout is a
  real invocation failure.
- **Scanner CLIs are pinned to exact versions** (e.g. `afdocs@0.20.0`, `is-agentic@1.0.1`) in each
  adapter file, not called via a bare/unpinned `npx`. Bump deliberately and re-verify that
  adapter's `normalize()` against the new output — both CLIs are young enough for breaking schema
  changes upstream. `npm run check-scanner-versions` reports drift against npm's latest without
  changing the pin; `AFDOCS_VERSION`/`IS_AGENTIC_VERSION` env vars override one run's version
  without editing source, for trying a newer release ahead of a deliberate bump.
  `.github/workflows/scanner-version-check.yml` runs that check weekly and files/updates a
  `scanner-version-drift`-labeled issue on drift — it never bumps the pin itself. Ora
  (`scanners/ora.js`) has no pin at all — it's a live API call, so it's always on the latest engine
  by construction; this scheme only applies to versioned CLI-based scanners.
- **`enhance` never commits or pushes on its own.** It writes to the working tree and either opens
  a PR (`--pr`, needs a git remote + authenticated `gh`) or leaves an unstaged diff for review. It
  also never overwrites a file the target repo already has — it skips and reports instead.
- **New scanner integrations prefer CLI/API/MCP over UI scraping.** A scanner with no CLI/API stays
  manual/optional rather than being automated via headless browser (see README "Design notes").
- **Cross-platform is a real correctness bar** (Windows/macOS/Linux, tested in CI): `.cmd` shims on
  Windows need `spawn(..., { shell: true })`; killing a spawned process tree on Windows needs
  `taskkill /t` (`child.kill()` alone leaves child processes like wrangler running).
- **Node version note:** siteready itself needs Node ≥18, but the `examples/astro-starlight-cf-pages`
  fixture's Astro dependency currently requires Node ≥22.12 to build — CI runs Node 22 for this
  reason. A "Node.js vX is not supported by Astro" failure from `loop`/`verify-loop.js` is the
  fixture's dependency, not siteready itself — upgrade Node, don't downgrade Astro's declared range.
