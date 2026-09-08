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

---

## v0.3.0 — First Real-World Dogfood: docs.doverunner.com

**Date:** 2026-09-08

### Changes

- Ran the full `scan` → `enhance` → manual fixes → `rescan` loop against a
  live production site (`docs.doverunner.com`, Astro+Starlight+Cloudflare
  Pages) for the first time — previously only exercised against the
  synthetic `examples/astro-starlight-cf-pages` fixture and subagent
  sanity-checks.
- `enhance .` correctly detected the stack, added the one fixer output the
  target was missing (`functions/_middleware.js`), and correctly skipped
  everything it already had without overwriting.
- Identified three `is-agentic` checks with no fixer coverage yet
  (`metadata-completeness` og:image, `agent-instruction` llms.txt
  guidance, homepage Organization `json-ld`) — hand-patched in the target
  repo this session, queued as real fixer work (see HANDOFF.md Next
  Actions #1).
- Identified an `is-agentic`-specific caching gotcha: `rescan` returned an
  identical cached result twice across a real production deploy; the score
  only moved (68 → 72, D → C) after a manual rescan trigger on
  is-agentic.com itself. `afdocs` re-crawls live on every `rescan` call, so
  this is isolated to the `is-agentic` scanner adapter.

### Status

First external validation that the scan/enhance/rescan loop holds up
against a real, previously-hand-built site rather than a fixture built to
exercise the fixer. Confirmed the fixer's "skip what's already there, never
overwrite" behavior works correctly against a site with prior organic
history. Fixer capability gaps and the is-agentic caching behavior are now
tracked in HANDOFF.md rather than being one-off manual patches next time.

---

## v0.4.0 — Fixer Coverage: og:image, Organization JSON-LD, agent-friendly 404

**Date:** 2026-09-08

### Changes

Closed the three fixer gaps identified in v0.3.0 (HANDOFF.md Next Actions
#1-2), all in `src/fixers/astro-starlight.js`:

- Added a `Head.astro` override template (site-wide `og:image` meta tag,
  homepage-only Organization JSON-LD) — `writeIfAbsent`'d, same as the
  existing Banner override.
- Added an `extractOrgInfo(source)` helper: regex-extracts `title`/`site`/
  `social[].href` out of the target's own `starlight({...})` config and
  bakes them into the written Head.astro as literals (name/url/sameAs).
  `description` is read live at request time via `getEntry('docs', 'index')`
  instead of extracted, since the homepage's own frontmatter description is
  already reliably present and stays in sync automatically. If `title`/
  `site` can't be found, the fixer still writes the og:image tag but skips
  the JSON-LD block and returns a warning — never invents org data.
- Added a `NOT_FOUND_PAGE` template written to `src/content/docs/404.md`
  (Starlight's own 404-page convention) — a short, deliberately generic
  recovery body (homepage link + `/llms.txt` pointer only, no product-specific
  section links a fixer can't know about).
- Generalized `patchAstroConfig` from Banner-only to a list of component
  overrides (`Banner`, `Head`), each independently skip-if-already-registered,
  sharing one `components: {}` block insert/creation path.
- Updated `scripts/verify-loop.js`'s `stripFixerOutput` to also strip
  `Head.astro`, `404.md`, and the `Head:` config line so the CI loop test
  still exercises a genuine before/after across all seven fixer outputs.
- Applied the new fixer to `examples/astro-starlight-cf-pages` (the
  checked-in reference fixture) so it stays a complete "fully enhanced"
  target, consistent with the four pre-existing fixer outputs already
  committed there.

### Verification

- `Astro.props.id` does **not** carry the homepage slug on current Starlight
  (0.42) — it's `Astro.locals.starlightRoute?.id === ''`; caught this only by
  actually building the fixture and grepping the output HTML for the JSON-LD
  script tag (it was silently absent on the first pass). `Astro.props` route
  data access is deprecated in favor of `Astro.locals.starlightRoute` per
  `@astrojs/starlight/props.ts`'s own deprecation note — worth remembering
  for any future Head/Banner-style override work.
- Ran a full `enhance` → `npm install` → `astro build` on both a scratch copy
  of the fixture and the checked-in fixture itself; confirmed in the built
  HTML: `og:image` present on every page, Organization JSON-LD present only
  on `/index.html` with `name`/`url`/`logo`/`sameAs`/`description` all
  populated from the fixture's own config + frontmatter, and `/404.html`
  carrying the recovery body.
- `node scripts/check-syntax.js` and `node scripts/verify-loop.js` both pass
  (afdocs score 0 → 96 on the stripped-and-rebuilt fixture).
- Not re-verified against `is-agentic` (the scanner these three fixes
  actually target) — that scanner is a live, third-party, non-deterministic
  service (see v0.3.0's caching note); `verify-loop.js` only asserts against
  `afdocs`, which doesn't score these checks.

### Status

All three fixer gaps from the docs.doverunner.com dogfood are now real,
tested fixer capabilities rather than one-off hand patches. Next real-world
validation is re-running `enhance` against a *fresh* (never hand-patched)
Astro+Starlight+Cloudflare-Pages site and confirming the `is-agentic`
`metadata-completeness`/`json-ld`/`agent-friendly-404` checks move as
expected — see HANDOFF.md Next Actions.
