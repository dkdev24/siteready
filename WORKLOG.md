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

---

## v0.5.0 — Plain-Astro Fixer + Documented is-agentic Caching / smartypants Parity Gotchas

**Date:** 2026-09-08

### Changes

Dogfooded siteready against a real production Astro (no Starlight) +
Cloudflare Pages personal site during an unrelated agent-readiness fix
session there, then generalized what was learned back into siteready itself:

- Added `src/fixers/astro.js`, `applyAstroFixes(repoPath)` — the framework
  fixer for plain Astro sites with no `@astrojs/starlight` dependency:
  - `src/pages/404.astro` — real not-found page (Astro's own convention),
    written only if absent.
  - `public/robots.txt` — `Allow: /` for all agents, plus a `Sitemap:` line
    only when both a `site` value and `@astrojs/sitemap` are found in
    `astro.config.*` (never invents a sitemap URL that doesn't exist).
  - `src/utils/smartquotes.ts` + targeted warnings — written only if the
    repo has at least one `*.md.ts` route under `src/pages` that echoes a
    collection entry's raw `.body`/`entry.body` back verbatim and doesn't
    already reference "smart quotes"; each such route gets a named warning
    to wrap its served body in `smartQuotes()`. Deliberately does not edit
    the route itself — fixers only ever add new files, per CONTRIBUTING.md.
- `src/detect-stack.js`: `framework` is now `"astro-starlight"` (has
  `@astrojs/starlight`), `"astro"` (has `astro`, no Starlight), or `null`.
  `supported` now covers both, still gated on `platform === "cloudflare-pages"`.
- `src/enhance.js`: dispatches to the matching framework fixer via a
  `FRAMEWORK_FIXERS` lookup instead of hardcoding
  `applyAstroStarlightFixes` — the platform fixer call is unchanged and
  already framework-agnostic.
- Documented two real scanner/gotcha findings from the dogfood session in
  README.md ("Design notes") and SKILL.md:
  - **`is-agentic` caching**: rescanning right after a confirmed-live deploy
    returned the *identical* cached result (same `scanned_at`) as the scan
    taken before the deploy — closes the v0.4.0 Next Actions #3 item that had
    been open since the first time this was observed against
    `docs.doverunner.com`. `afdocs` re-crawls live every time and doesn't
    have this problem.
  - **markdown-content-parity vs. Astro's default smartypants**: a `.md.ts`
    route serving a collection entry's raw body will fail afdocs'
    `markdown-content-parity` check on quote-heavy content even when the
    served markdown is byte-for-byte correct, because Astro's default
    `remark-smartypants` curls quotes/apostrophes on rendered HTML only, not
    on the raw collection body. Root cause found by `curl`-diffing the live
    `.md` route against the live rendered page; this is what `smartQuotes()`
    exists to close. A smaller residual gap on Markdown-footnote-heavy posts
    (`[^1]` source vs. a bare rendered number) looks like a structural limit
    of that specific check rather than something fixable.

### Verification

- `node scripts/check-syntax.js` passes.
- Manually verified (not yet a `scripts/verify-loop.js`-covered fixture — see
  Next Actions): `rsync`'d a real production Astro+Cloudflare-Pages site into
  a scratch directory and ran `enhance` against the copy twice.
  - First run: correctly detected `astro + cloudflare-pages`; wrote
    `public/robots.txt` (with the correct `Sitemap:` URL, extracted from the
    site's own `astro.config.mjs`) and `functions/_middleware.js`; correctly
    skipped `src/pages/404.astro` (already present in the target) and did
    **not** write `smartquotes.ts` or warn about anything, because the
    target's two real markdown-mirror routes already referenced
    `smartQuotes()` by hand and its index/listing/about routes correctly
    don't match the `.body`-echoing heuristic.
  - Caught and fixed one false-positive round before that: an earlier
    version of the heuristic flagged *any* `*.md.ts` file, which incorrectly
    warned about listing routes and a data-driven `about.md.ts` with no raw
    body content at all. Requiring a `.body`/`entry.body` reference in the
    file before warning fixed it — confirmed zero warnings against the
    (already-fixed) real target and correct exclusion of its listing routes.
  - Second run: clean no-op — everything skipped, nothing rewritten.

### Status

siteready now has two Astro fixers (Starlight and plain) sharing one
Cloudflare Pages platform fixer, `package.json` at `1.1.0`. Not yet backed by
an automated fixture/CI test the way the Starlight fixer is (see HANDOFF.md
Next Actions #1) — verification so far is a real site's scratch copy, not a
`scripts/verify-loop.js`-covered synthetic project, and not yet re-verified
against a live scanner's before/after score delta on a site missing all
three fixes from scratch.

---

## v0.5.1 — Plain-Astro Fixer: CI Fixture Coverage

**Date:** 2026-09-08

### Changes

- Added `examples/astro-cf-pages/` — a from-scratch, minimal plain-Astro
  (no Starlight) reference fixture: home + about + a 3-entry `posts`
  collection with hand-rolled `.md.ts` mirror routes (including a root
  `index.md.ts`, needed so afdocs' single-page crawl — it only discovers
  more pages via `llms.txt`, which this fixer never writes — has a markdown
  mirror to test against). Checked in with `src/fixers/astro.js`'s output
  already applied, matching the Starlight fixture's "checked in after"
  convention.
- Rewrote `scripts/verify-loop.js` to loop over both reference fixtures
  (Starlight + plain) instead of hardcoding the Starlight one, each with its
  own strip/verify functions.
- Finding: afdocs' `overall` score is gated on `llms-txt-exists` — every
  other `categoryScores` entry comes back `null` whenever that check fails.
  Since `astro.js` deliberately never writes `llms.txt` (no content
  collection convention to build one from without guessing the site's
  routing), `overall` reads `0` before and after this fixer runs regardless
  of its actual fixes. Confirmed by hand-diffing the full check list: the
  fixer's real targets (`http-status-codes` via `404.astro`,
  `content-negotiation` via the Cloudflare Pages middleware) do flip from
  `fail` to `pass`. `verify-loop.js`'s `astro-cf-pages` fixture asserts on
  those individual checks instead of the gated `overall` score; documented
  in `examples/astro-cf-pages/README.md`.
- `package.json` bumped to `1.1.1` (patch — CI coverage for an already-
  shipped fixer, not a new subsystem).

### Status

Both Astro fixers now have automated, CI-covered reference fixtures via
`npm run verify-loop`. HANDOFF.md Next Actions #1 closed. Next Actions #2
(fresh real-site verification) still open, now with the added note that its
score check should target individual afdocs checks, not `overall`.

---

## v0.6.0 — Third Scanner: Ora (Full Ranker Behind Vercel's Is Agentic)

**Date:** 2026-09-08

### Changes

- Added `src/scanners/ora.js`. User found
  https://ora.ai/blog/is-agentic-with-vercel: is-agentic.com is a Vercel
  front end over Ora's public API (`POST /api/scan?include=essentials`,
  80/20/5-point simplified scoring). This adapter calls the full ranker
  instead — 127 checks across four layers (discovery, accessibility,
  usability, payments) — via the same endpoint without the `include` filter,
  using `format=audit` for the documented/versioned response shape. No CLI
  exists for Ora, so this is the first scanner adapter to call `fetch()`
  directly rather than going through `npx-runner.js`; the API is public and
  keyless for reads.
- Registered in `SUPPORTED_SCANNERS` (`src/scan.js`); added to `loop.js`'s
  hosted-scanner guard (generalized from a single `is-agentic` check to a
  list, since a second hosted-only scanner needed the same treatment).
- Caught and fixed one bug via a real scan (`vercel.com`, both raw adapter
  and full `node src/cli.js <url> --scanners ora` CLI path): Ora's `url`
  response field is its own report-page URL, not the scanned site —
  `finalUrl` is. `normalized.target` now reads `finalUrl`; added a
  `reportUrl` field (matches `is-agentic.js`'s existing convention) carrying
  the report-page URL separately.
- README.md: scanner table, `raw/` output list, adapter-contract section
  (documents the npx-runner exception for `ora.js` and why), and the
  existing is-agentic caching caveat now notes Ora's API exposes a real
  `force` param the adapter deliberately doesn't default to (rate-limited to
  6 forced scans/day).
- `package.json` bumped to `1.2.0` (minor — new scanner subsystem).

### Status

Three scanners now run side by side under one normalized report shape with
zero changes to `report.js`/`diff-report.js`. `ora.js` verified against a
real live site end-to-end (adapter + CLI + report rendering) but has no
fixture/CI coverage yet — `loop`/`verify-loop.js` can't reach hosted
scanners at all, so this needs the same real-deploy step as HANDOFF.md's
open Next Actions #2.

---

## v0.6.1 — ora Made Opt-In (Not a Default Scanner)

**Date:** 2026-09-09

### Changes

- Added `DEFAULT_SCANNERS` (`is-agentic`, `afdocs`) to `src/scan.js`, distinct
  from `SUPPORTED_SCANNERS` (all three). `ora` is now opt-in via
  `--scanners ora` instead of running by default on every `scan`/`rescan`.
- Reasoning (from user discussion): `is-agentic`'s score is computed from the
  same Ora API with `include=essentials` — a strict subset of `ora`'s full
  ranker, not independent data. With no fixer yet acting on `ora`'s extra
  checks, running both by default just doubled hosted-API cost for
  overlapping score data on every scan.
- Updated `src/cli.js` help text and README.md (scanner table + a new Design
  notes bullet) to document the opt-in status and the future consolidation
  path: if an `ora`-specific fixer ever ships, retire `is-agentic.js` in
  favor of `ora.js` requesting `include=essentials` in the same API call.
- `package.json` bumped to `1.2.1` (patch — default-set behavior fix, no new
  subsystem).

### Status

`scan`/`rescan` default to `is-agentic` + `afdocs`; `ora` available on
request. No code changes to `ora.js` itself — this only changed which
scanners run without `--scanners` specified.

---

## v0.7.0 — Scanner-Version Freshness (Override + Drift Check)

**Date:** 2026-09-09

### Changes

- `scanners/afdocs.js` and `scanners/is-agentic.js` now export
  `PACKAGE_NAME`/`PINNED_VERSION`; `PACKAGE_SPEC` resolves from an
  `AFDOCS_VERSION`/`IS_AGENTIC_VERSION` env var when set, falling back to
  the pinned constant otherwise. Lets a single run try a newer CLI release
  with no source edit, without changing the safe pinned default.
- Added `scripts/check-scanner-versions.js` (`npm run
  check-scanner-versions`): compares each pinned version against npm's
  latest published release (`registry.npmjs.org/<pkg>/latest`) and reports
  drift. Read-only — never touches the pin; a bump still needs
  `normalize()` re-verified against the new output first, per the existing
  pinned-CLI-versions rule.
- Motivation: user asked how to stay on the latest scanner engines without
  updating siteready itself, given agent-readiness scanning is a young,
  fast-moving category. `ora.js` already had no version to pin (direct API
  call); this closes the same gap for the two CLI-based scanners without
  reopening the silent-schema-break risk the pin exists to prevent.
- Documented in AGENTS.md (Standing Development Rules), README.md (new
  Design notes bullet), and `cli.js --help`.
- `package.json` bumped to `1.3.0` (minor — new tooling/mechanism).

### Status

Three scanners, two of them CLI-pinned with an escape hatch + drift
visibility, one (`ora`) always current by construction. No scanner pins
were actually behind at the time of this change (`check-scanner-versions`
reported both up to date).
