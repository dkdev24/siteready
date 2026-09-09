# AGENTS.md

Instructions for AI agents (Claude Code, OpenCode, and others) working in this repo.

## System Documents

`HANDOFF.md` is the only one read at the start of every session — kept under 50
lines on purpose, it's a dashboard of current state plus pointers into the docs
below (`NEXT_ACTIONS.md`, `ISSUES.md`, `WORKLOG.md`). Update it at the end of
every session. The other documents are read only when the task at hand needs
their detail; don't load them just because a session started.

### HANDOFF.md

- Location: `HANDOFF.md`
- Purpose: Cross-session dashboard — current version, top blocker, and a table
  pointing at the documents below.
- **Read at the start of every session.**
- **Update at the end of every session.** Keep it under 50 lines — if an update
  would blow the budget, the content belongs in one of the docs below instead,
  with just a pointer left in HANDOFF.md.

### NEXT_ACTIONS.md

- Location: `NEXT_ACTIONS.md`
- Purpose: Open TODOs, numbered, oldest-unresolved first.
- **Update at the end of a session that closes, adds, or reprioritizes an item.**
  Replace the file's contents (not append-only, unlike WORKLOG.md).

### ISSUES.md

- Location: `ISSUES.md`
- Purpose: Known open issues/limitations not yet actioned.
- **Append as needed.** Remove an entry only once it's actually resolved (not
  just worked around) and record the fix in WORKLOG.md.

### WORKLOG.md

- Location: `WORKLOG.md`
- Purpose: Persistent project history — the single narrative log of what
  happened each session, why, and how it was verified.
- Contains: one entry per version milestone (`## vX.X.X — Title`), plus one
  per session that doesn't ship a version bump (`## <date> — Title (no
  version bump)`) so the history stays complete without a second log.
- **Do not load at session start.** Read only when history is directly relevant to the current task.
- **Append a new entry at the end of every session that changes the code or
  makes a significant decision.** Never edit past entries.
- Version format: `x.x.x` — increment the patch for small changes, minor for new subsystems, major for engine-complete milestones.

## Project Notes

- `siteready` is a CLI tool: scan a site with multiple agent-readiness scanners, normalize
  results into one scorecard, auto-fix supported issues, re-scan, and diff. See README.md
  for usage and CONTRIBUTING.md for how to add new scanners/fixers.
- Run `node scripts/check-syntax.js` (aliased as `npm run lint`) and `node scripts/verify-loop.js`
  (`npm run verify-loop`) before committing changes to core logic.

### Key Paths

| Path | Purpose |
|---|---|
| `src/cli.js` | CLI entrypoint (scan / enhance / rescan / diff-report / loop / lint) |
| `src/scan.js`, `src/scanners/` | Scanner orchestration (afdocs, is-agentic, ora) |
| `src/enhance.js`, `src/fixers/` | Framework/platform detection + auto-fixers |
| `src/fixers/near-miss.js` | `/url-index.json` route + the 404-resolution logic injected into the CF middleware — spans framework and platform, so it lives on its own |
| `src/lint.js` | Local link check against build output — finds `href`/`link` in component props and frontmatter that markdown validators don't see |
| `src/report.js`, `src/diff-report.js` | Scorecard normalization + before/after diffing |
| `src/loop.js` | Full local scan→enhance→rescan→diff-report loop |
| `examples/astro-starlight-cf-pages/`, `examples/astro-cf-pages/` | Reference fixer targets + reproduction steps |
| `scripts/verify-loop.js` | CI verification of the full loop |
| `siteready-plan.md` | Original design plan — **frozen, not maintained.** Historical design rationale only; its §13 lists where it's now wrong. Don't update it; don't cite it as current state |
| `SKILL.md` | Claude Code skill entrypoint — orchestration instructions for running siteready as an agent, cwd-agnostic (uses `<skill-dir>`) |

## Standing Development Rules

- **siteready is a tool, not a skill — and `SKILL.md` never implements behavior.** The project's
  identity is a runnable CLI (real `bin`, real code, CI) with two equal front doors onto one
  engine: humans invoke the `siteready` binary (or `node src/cli.js`) directly, agents read
  `SKILL.md`. `SKILL.md` is a thin adapter — *when* to run which command and how to interpret the
  output — and must never contain logic, heuristics, or a workaround that isn't in `src/`. New
  capability lands in `src/` as a CLI command or flag, so the human CLI and the agent path get it
  in the same commit. If a change would only work when an agent is driving, it's in the wrong
  place.
- **This is a public repo — don't write employer-internal identifiers into it.** No internal
  hostnames, internal document/wiki names, objective/KPI references, or links into private repos.
  When a real site is dogfooded, describe it generically ("a real production Astro + Starlight
  docs subdomain, no public API") — the technical finding is the point, the identity never is.
  Existing occurrences in git history and in past `WORKLOG.md` entries were reviewed on 2026-09-09
  and **deliberately accepted** (NEXT_ACTIONS.md #11): they're mildly-sensitive context, not
  credentials. Don't re-litigate that and don't try to purge them — past WORKLOG entries are
  append-only regardless. This rule is about new writing only.
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
