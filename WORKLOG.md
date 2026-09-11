# WORKLOG.md

Persistent project history. Append entries; do not edit past entries. Most
entries mark a version milestone (`## vX.X.X — Title`); a session that doesn't
ship a version bump still gets an entry, at the end, headed by date + title
instead (e.g. `## 2026-09-09 — Title (no version bump)`).

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

---

## v0.7.1 — Weekly CI Wiring for check-scanner-versions.js

**Date:** 2026-09-09

### Changes

- Added `.github/workflows/scanner-version-check.yml`: runs
  `check-scanner-versions.js` on a schedule (Monday 09:00 UTC) plus
  `workflow_dispatch`, and files or updates a single
  `scanner-version-drift`-labeled GitHub issue when a pin is behind
  (`actions/github-script`, searches for an existing open issue with that
  label before creating a new one — no duplicate weekly issues). Never
  bumps the pin itself.
- `scripts/check-scanner-versions.js` now writes `behind=<bool>` to
  `$GITHUB_OUTPUT` when that env var is set, so the workflow step can
  branch on `steps.check.outputs.behind` instead of re-parsing stdout.
  Local `npm run check-scanner-versions` is unaffected (no `GITHUB_OUTPUT`
  outside Actions).
- Validated the workflow YAML with `npx js-yaml` and the `GITHUB_OUTPUT`
  write with a manual env-var simulation — no local GitHub Actions runner
  available to dry-run the scheduled trigger itself; flagged in HANDOFF.md
  Next Actions #9 to confirm via a manual `workflow_dispatch` after merge.
- `package.json` bumped to `1.3.1` (patch — wiring already-shipped tooling
  into CI, not new functionality).

### Status

`check-scanner-versions.js` (v0.7.0) now runs unattended weekly instead of
only on manual invocation. Not yet confirmed against a real Actions run.

---

## 2026-09-09 — Value-Proposition Doc (no version bump)

**Date:** 2026-09-09

### Changes

User asked a sharp question: since every scanner already returns a
`fix`/`recommendation` string per failing check, does siteready still add
anything over an agent with repo access just calling the scanners directly
and acting on that text? Talked it through, then wrote the conclusion into
README.md as a new "Why use this, instead of pointing an agent at the
scanners directly?" section (right after Status, before Usage). Docs-only
change — nothing about the running tool changed, so no version bump.

The honest conclusion, now in the README: the scan/report/normalization
layer is genuinely weaker as a pitch in an agent-native world (an agent
doesn't need one unified JSON schema across three scanners — it can read
each one's own `fix` field directly). The real, defensible value is the
**fixers** — turning a one-line scanner suggestion into idempotent,
cross-platform-verified code, backed by this project's own history of real
bugs an ad hoc fix would've hit (`smartQuotes()`'s smartypants-parity bug,
the false-positive `.md.ts` heuristic, the CRLF fixture-stripping bug,
`taskkill /t`, `is-agentic`'s caching trap, Ora's `url`-vs-`finalUrl` trap)
— plus the local **loop** proving a fix worked before anything ships. Also
wrote the honest limit: outside the Astro(+Starlight)+Cloudflare-Pages
combos a fixer covers, siteready is just a wrapper around scanner output
today.

### Status

Docs-only; `package.json` stays at `1.3.1`. Reframes the roadmap as
"fixer/platform coverage is the moat," not scanner count.

---

## 2026-09-09 — loop + Hosted Scanners via Tunnel (WIP, no version bump — decision pending)

**Date:** 2026-09-09

### Changes

User's framing: `loop`'s scan→enhance→rescan→diff-report only works for
afdocs (fetches the URL itself, `localhost` is fine); is-agentic/ora are
*hosted* — their crawler runs on Vercel's/Ora's own infrastructure and can
never reach `localhost` — so `loop` has hard-rejected them since v0.4,
forcing a real deployment to validate a fix with those two. Landed on
Cloudflare Quick Tunnels (`cloudflared tunnel --url`, no account/signup,
ephemeral `*.trycloudflare.com` URL) as the mechanism, chosen explicitly
over `localtunnel` and over "just document the limitation." Built:

- `src/lib/tunnel.js` (new): `startTunnel(localUrl)` spawns `cloudflared`
  via `spawnNpxCli`, parses the tunnel URL from its log output, self-checks
  reachability before returning, plus an 8s settle buffer
  (`PROPAGATION_BUFFER_MS`) added after Ora returned "Domain is not
  reachable" on a scan attempted before the route had propagated.
- `killProcessTree` extracted from `lib/local-server.js` into
  `lib/npx-runner.js` (shared Windows-`taskkill /t`-vs-POSIX-process-group
  teardown logic — pure move, no behavior change).
- `loop.js`: replaced the hard `throw` on `is-agentic`/`ora` with
  `startScanTarget()` — layers a tunnel on top of the local server when a
  hosted scanner is requested; falls back to the plain local server
  otherwise. Zero regression risk, confirmed via `npm run verify-loop`.
- `cli.js --help` updated to describe the tunnel behavior.

### Verification

Inconclusive, not a clean pass. First end-to-end test (`loop` against
`examples/astro-cf-pages --scanners ora`) failed with "Domain is not
reachable" — root-caused to a propagation race and fixed via the
reachability check + buffer above. Re-tested three more times (1 via `loop`,
2 via a standalone `startTunnel()` script) — all three hit a DNS resolution
failure (`ENOTFOUND`) for the `*.trycloudflare.com` hostname, reproduced
identically via `curl` and Node's `fetch`. Net: 1 success in 4 attempts.
cloudflared's own banner text: "these account-less Tunnels have no uptime
guarantee." Unclear how much is inherent to anonymous Quick Tunnels vs. this
sandbox's network path.

### Status

Committed as WIP — additive/opt-in, provably doesn't regress the default
path, but not verified reliable. Three options on the table, none
implemented: (1) retry with a fresh tunnel per attempt, (2) a named/
authenticated Cloudflare Tunnel (needs a CF account), (3) roll back to the
hard-reject. `package.json` stays at `1.3.1` until this is resolved — see
NEXT_ACTIONS.md #0. Do not describe "loop supports hosted scanners" as
shipped until re-verified.

---

## 2026-09-09 — Positioning, Tool Identity, and a Public-Repo Sanitization Miss (no version bump)

### Context

Docs-and-positioning session, no engine changes. Three threads, in order:
competitive differentiation against GEO skill packs; resolving whether this
project is a "skill" or a "tool"; and a review of the long-unmaintained
`siteready-plan.md`, which turned up a disclosure problem.

### Changes

**Positioning vs. GEO tooling.** Prompted by
`github.com/Cognitic-Labs/geoskills` — six prompt-only skills (`geo-audit`,
`geo-fix-*`, `geo-compare`, `geo-monitor`) that score a URL and emit
recommendations. Added a README section (`How this differs from GEO /
prompt-based audit skills`) naming it explicitly and arguing four axes:
third-party scanner scores vs. a model grading itself (reproducible and
citable vs. neither); fixes as debugged code vs. templates (the
`smartQuotes()`/`remark-smartypants` case is the standing proof); the loop as
a falsification step an advisory tool structurally can't add; and
agent *action* (negotiation, `.md` mirrors, Ora's payments/ARD/A2A layer) vs.
GEO's agent *citation*. Closes by conceding where a URL-only pack wins:
coverage outside the supported fixer stacks, plus compare/monitor features
siteready lacks. Also added a positioning paragraph to the intro.

**Tool-vs-skill identity resolved: it's a tool.** The code already agreed
(shebang, real `bin`, no library exports) — the ambiguity was packaging and
docs. `package.json`: dropped `private: true`, added
`repository`/`homepage`/`bugs`/`keywords` and a `files` whitelist (`npm pack
--dry-run`: 25 files, 42.5 kB, no `examples/`, `out/`, or internal docs).
README: new `What this is: a tool, not a skill` section framing two equal
front doors onto one engine (humans → the `siteready` binary, agents →
`SKILL.md`), an `Install` section, and every usage example rewritten to
`siteready <command>` with `node src/cli.js` noted as the from-source form.
`SKILL.md`: opening reframed as a thin adapter with no logic of its own, and
it now prefers a PATH `siteready` binary over the `node <skill-dir>/src/cli.js`
form. `AGENTS.md`: added as standing rule #1, including the invariant that
keeps it honest — **`SKILL.md` never implements behavior; new capability lands
in `src/` so both front doors get it in the same commit.**

**`siteready-plan.md` frozen, and sanitized.** The plan hadn't been updated
since the v1.0 cut and had drifted into contradicting the codebase (it called
the project "a Claude Code **skill**" in §1/§4, and described a TypeScript
`scripts/`-based architecture that was never built). Rather than revive it as
a live doc — `HANDOFF`/`NEXT_ACTIONS`/`ISSUES`/`WORKLOG` already own that
role, and a second live plan just re-creates the drift — it was frozen: a
header routing readers to the live docs, the design rationale that exists
nowhere else preserved (CLI-first over UI scraping, the framework/platform
axis split, `enhance` never commits, the npx-layout bug, CF Pages' inability
to branch on `Accept`), the ten dated update notes folded into the sections
they belonged to, the v1.0 scaffolding checklist finally checked off, and a
new §13 tabulating the nine places the plan is now known to be wrong.

### The disclosure finding

Reviewing that file surfaced the real issue: **it was sitting at the root of
the public `dkdev24/siteready` repo still carrying the origin project's
identity** — the internal docs hostname, internal planning/report document
filenames, objective/KPI references, internal wiki mentions, and relative
links into the private source repo's `references/` tree. §3 of that very file
is the sanitization boundary it violated. Root cause: the v1.0 sanitization
pass (v1.0 entry, "update 7") deliberately covered the README, the example
fixture, and code comments — but not the plan, because at that point the plan
still lived in the private repo and only moved across later, after the
boundary had been declared satisfied. Two smaller leaks of the same hostname
were found and fixed in `ISSUES.md` and `NEXT_ACTIONS.md`.

All sanitized in the working tree. **Not resolved:** `git log -S` confirms the
strings remain in already-pushed public commits, so history and forks still
expose them — logged as NEXT_ACTIONS.md #11 (DECISION NEEDED) with the two
options (accept, or `git filter-repo` + force-push). History was deliberately
left untouched: destructive, irreversible, and needs an explicit go-ahead.
`WORKLOG.md`'s own four mentions were also left in place on purpose — past
entries are append-only per AGENTS.md, and unlike the plan they're honest
historical record rather than a design doc presented as current state.

### Verification

`npm run lint` clean (17 files). `npm pack --dry-run` clean. Repo visibility
confirmed PUBLIC via `gh repo view`. `npm` names `siteready` and `site-ready`
both confirmed unclaimed. No `src/` changes, so `verify-loop` was not re-run.

### Status

Docs only; `package.json` stays at `1.3.1`. NEXT_ACTIONS gained four items:
#11 (git-history sanitization decision), #12 (npm publish decision — the
package is publishable but unpublished, so the README's `npm install -g`
instructions are a promise not yet kept), #13 (fixer coverage as the real
competitive gap, Next.js + Vercel highest-leverage), #14 (compare + monitor
parity). NEXT_ACTIONS #0 (the tunnel decision) is untouched and still the top
blocker.

---

## 2026-09-09 — Git-History Sanitization Decision: Accepted As-Is (no version bump)

Follow-up to the entry above. NEXT_ACTIONS.md #11 is resolved: Daniel accepted
option (a) — the internal references remaining in the **public** repo's pushed
git history stay, no `filter-repo`, no force-push. Reasoning on record: the
material is mildly-sensitive employer context rather than credentials, the
hostname belongs to a publicly-reachable site anyway, and a rewrite wouldn't
reach existing forks, clones, or caches regardless. The prior session's docs
commit was merged to `main` and pushed (`552ee88`).

Documented so it isn't re-litigated: #11 is struck through but kept as the
standing record of what's in history and why it's fine; HANDOFF.md's "Right
Now" moves it to a "settled, don't reopen" line and returns #0 (the tunnel
decision) to sole top-blocker status; and AGENTS.md gains a standing rule
stating the boundary **for new writing only** — no internal hostnames,
document/wiki names, objective/KPI references, or private-repo links; describe
dogfooded sites generically, since the technical finding is the point and the
identity never is. The rule explicitly tells future sessions not to re-open the
accepted history or try to purge past `WORKLOG.md` entries, which are
append-only in any case.

---

## v1.4.0 — Tunnel Retry (Hosted Scanners in `loop`) + Ora Rate-Limit Disclosure

**Date:** 2026-09-09

### Context

Resolves NEXT_ACTIONS.md #0, the standing top blocker. The previous session
built Cloudflare Quick Tunnel support so `loop` could exercise the *hosted*
scanners (is-agentic, ora) against a local preview server, but shipped it as
WIP: 1 success in 4 attempts, with `ENOTFOUND` DNS failures on the
`*.trycloudflare.com` hostname. Three options were on the table; Daniel chose
option (1), retry with a fresh tunnel per attempt.

### Changes

- `src/lib/tunnel.js`: `startTunnel()` now loops over up to 3 attempts
  (`DEFAULT_ATTEMPTS`, overridable per-run via the `SITEREADY_TUNNEL_ATTEMPTS`
  env var, same pattern as `AFDOCS_VERSION`/`IS_AGENTIC_VERSION`). The old
  single-shot body moved verbatim into `startTunnelOnce()`; the retry unit is
  deliberately a **whole tunnel** — kill the connector, spawn a new one — not
  a re-probe of the same URL, because the observed failure is that the
  hostname cloudflared hands out never resolves at all. Re-probing that URL
  can never recover; a fresh tunnel gets a fresh random hostname, which does.
  On exhaustion it throws one aggregated error listing every attempt's failure
  and naming the env var and the "scan a deployed URL instead" way out.
- Two robustness fixes found while wiring the retry, both of which previously
  cost a full 30s timeout or worse:
  - a `child.on("error")` handler — without a listener a spawn failure was an
    unhandled `'error'` event that would take the whole process down instead
    of failing just that attempt;
  - `waitForReachable()` now takes `getExitError` and bails the moment the
    connector dies mid-probe, so a dead tunnel spends its remaining budget on
    the next attempt rather than polling a corpse.
- `cli.js --help`: documents the retry and the env var.

### Verification

Three passes, all clean:

1. **Retry/failure path**, forced: tunnelled to a port with no listener
   (`SITEREADY_TUNNEL_ATTEMPTS=2`) so no attempt could ever become reachable.
   Both attempts ran, each got a *different* hostname (confirming a genuinely
   fresh tunnel, not a re-probe), and the aggregated error listed both.
2. **The real `loop` run** NEXT_ACTIONS.md #0 demanded:
   `node src/cli.js loop examples/astro-cf-pages --scanners ora` — exit 0, both
   the baseline and the post-enhance re-scan tunnels came up on attempt 1, Ora
   scored both (27/100 → 27/100; the fixture already has the fixes committed,
   so `enhance` correctly "wrote nothing (already applied)" — the flat delta is
   the fixture, not a tunnel or fixer problem, and is exactly the gap
   NEXT_ACTIONS.md #2 exists for).
3. **Reliability re-measurement**, since the whole blocker was a success rate:
   6 sequential single-attempt tunnels against a real local origin, each
   fetched end to end — 6/6, ~19–35s each. With the loop's 2, that's 8/8 today
   against last session's 1/4. The earlier failures therefore look transient/
   environmental rather than inherent to Quick Tunnels, and retry is headroom
   over a bad network day rather than a workaround for a permanent defect.

`npm run lint` and `npm run verify-loop` both pass (verify-loop still runs
afdocs only, deliberately — see NEXT_ACTIONS.md #7).

### Status

Shipped. `loop` supporting hosted scanners is now accurate to say out loud.
Residual risk is documented rather than solved: Quick Tunnels are anonymous
and best-effort by design, so a run can still exhaust all 3 attempts; if that
becomes routine rather than rare, the fallback remains a named/authenticated
Cloudflare Tunnel (option 2, needs a CF account).

### Follow-on: Ora rate limits made visible to users

Daniel's point: the Ora API's rate limits were real constraints that only
existed in a source comment and one line of README "Design notes" — a user
running `--scanners ora` had no way to know what they were spending. Verified
the numbers against Ora's own docs (https://ora.ai/docs, the reference link,
already cited in `ora.js`) rather than trusting the repo's copy: **10 scans/min
burst, 30 per rolling 24h, 6 of those force/cache-bypassing, all per IP; HTTP
429 with a `Retry-After` header; responses from the 6-hour freshness cache
never consume quota.** The repo's existing numbers were correct.

- `src/scanners/ora.js`: a 429 now gets its own error instead of the generic
  `${status} ${statusText}` dump — it names all three quotas, echoes Ora's
  `Retry-After` (with a sane fallback when the header is absent), explains that
  cache hits are free so it's *distinct* URLs that burn quota, and links the
  docs. Smoke-tested both branches with a stubbed `fetch`.
- `cli.js --help`, README "Design notes", and `SKILL.md` all state the limits
  and link `ora.ai/docs`.

Two things corrected mid-write rather than shipped wrong:

1. A draft of the 429 message told users to avoid `--force`. There is no such
   flag — `force` is an adapter-internal default of `false` and the CLI never
   exposes it, so the message would have sent people looking for a flag that
   doesn't exist. Now it says siteready never forces, so the force quota isn't
   what they hit.
2. A draft of the `SKILL.md` guidance told the agent to report the other
   scanners' results and note that Ora was rate-limited. **`scanTarget()` can't
   do that** — it awaits scanners in a bare loop and only calls `buildReport()`
   after all of them return, so any one failure discards the successful
   scanners and writes no report at all. Documented the real behavior instead
   of quietly rewriting the orchestrator, and filed the gap as NEXT_ACTIONS.md
   #15: worth fixing (a slow afdocs+is-agentic scan shouldn't be lost to a rate
   limit on an opt-in third scanner), but it changes the report contract —
   per-scanner error state, partial scoring, and `diff-report` refusing to
   compare a baseline against a re-scan missing a scanner — so it's a design
   decision, not a patch.

## 2026-09-09 — Real-deploy verification of `enhance` score delta (no version bump)

Ran NEXT_ACTIONS.md #2 end to end against `danielkimdev-astro` (public URL
`danielkimdev.com`, plain Astro + Cloudflare Pages, sibling repo in the same
parent folder as this one): baseline `scan` -> `enhance` (no `--pr`) ->
reviewed the diff -> committed + pushed directly to `main` (user chose this
over `--pr` since it's their own site) -> waited for the Cloudflare Pages
deploy -> `rescan --baseline` -> `diff-report`.

`enhance` wrote two new files (`public/robots.txt`, `functions/_middleware.js`
for content negotiation); `src/pages/404.astro` already existed and was
skipped. Both `is-agentic` (94/100) and `afdocs` (98/100) came back **bit-for-
bit identical** pre- and post-deploy, including the full backlog list. Checked
`http-status-codes` and `content-negotiation` directly in both report.jsons:
both were already `pass` at baseline, so the new files didn't move anything.

Conclusion: the scan -> enhance -> deploy -> rescan -> diff pipeline itself
works correctly (this is the first time it's been run against a real prod
deploy rather than a local `loop` fixture) — but this site was already too
close to fully-fixed to serve as the "does the score move" test case.
NEXT_ACTIONS.md #2 is closed; a follow-up (finding/building a genuinely
fixer-naive site) would be a new item if pursued.

## 2026-09-09 — Fix: `enhance` duplicated `_middleware.js` next to existing `_middleware.ts` (no version bump)

The real-deploy test above (previous entry) had a bug: `enhance` wrote
`functions/_middleware.js` on `danielkimdev-astro` even though the repo
already had a hand-written `functions/_middleware.ts` doing the same job
(content negotiation, with a more complete section-index fallback). Root
cause: `src/platforms/cloudflare-pages.js`'s pre-existing-middleware check
(`applyCloudflarePagesFixes`) only ever tested `existsSync` on the literal
`_middleware.js` path — it never accounted for `.ts`, which Cloudflare Pages
Functions support equally.

This dedup logic was previously verified (v0.3.0, `docs.doverunner.com`) but
only against a `.js`-vs-nothing case; neither `examples/astro-cf-pages` nor
`examples/astro-starlight-cf-pages` has ever had a `.ts` middleware fixture,
so `verify-loop` never exercised this branch.

Fix: the check now looks for `_middleware.js` OR `_middleware.ts` and skips
if either exists. Cleaned up the duplicate on `danielkimdev-astro` directly
(removed `_middleware.js`, kept the pre-existing `.ts`, pushed). Added
`scripts/check-middleware-dedup.js` (new, wired into `npm run lint`) — a
small `assert`-based check exercising `applyCloudflarePagesFixes` directly
against temp dirs for the three cases (no middleware / `.js` exists / `.ts`
exists) rather than extending `verify-loop`'s fixtures, since seeding a
working `.ts` middleware into a fixture would change that fixture's baseline
`content-negotiation` score and break its existing assertions.

## v1.5.0 — Next.js + Vercel fixer (NEXT_ACTIONS.md #13)

**Date:** 2026-09-10

### Changes

- New `src/fixers/nextjs.js` (framework) + `src/platforms/vercel.js` (platform), same additive
  contract and `{ written, skipped, warnings }` shape as the Astro fixers — no changes to any
  already-shipped fixer/platform file. `nextjs.js` deliberately stays as small as `astro.js`: no
  llms.txt or markdown-mirror generation (no content-collection convention to build one from), just
  a real `app/not-found.js` and a permissive `robots.txt` (with a `Sitemap:` line only if
  `next-sitemap.config.js` declares a `siteUrl`).
- `vercel.js` writes a root `proxy.js` for `Accept: text/markdown` negotiation, mirroring
  `cloudflare-pages.js`'s middleware. Caught two things before shipping, both from actually running
  `next build`/`next start` against the fixture rather than trusting the pattern by inspection:
  1. **File convention**: Next.js 16 deprecated `middleware.js` in favor of `proxy.js` (same
     default-export shape) — building the fixture with the old name printed the deprecation warning
     directly; switched to `proxy.js` before shipping. The dedup check still recognizes both names
     (and both `.js`/`.ts`, and both repo-root/`src/`) so it never re-duplicates an older project's
     `middleware.*` — directly applying the lesson from the `_middleware.js`/`.ts` duplication bug
     fixed earlier this session.
  2. **NextResponse.next() vs raw fetch(request)**: an early draft fell through to `fetch(request)`
     to continue normal routing — self-fetching the original request risks the proxy re-intercepting
     its own outbound request. Replaced with `NextResponse.next()`, the documented pattern. Even so,
     verified against a real `next start` server that the `Vary: Accept` header appended to that
     passthrough response does **not** survive onto statically-cached HTML responses (only the `.md`
     branch's response reliably carries it) — documented as a known gap in the file's own comment
     rather than silently shipped as fully working; the negotiation mechanism itself is unaffected.
- `detect-stack.js`: added `nextjs` framework detection (`next` in deps) and a Vercel-default
  platform fallback for a Next.js project with no platform config file (same reasoning as the
  existing Astro → Cloudflare-Pages default — Vercel is Next.js's own zero-config target).
- `enhance.js` had a latent gap: it hardcoded `applyCloudflarePagesFixes` regardless of
  `stack.platform`, so no second platform could ever have worked even with a fixer written for it.
  Generalized to a `PLATFORM_FIXERS` dispatch map alongside the existing `FRAMEWORK_FIXERS` one.
- `lib/local-server.js`'s `startLocalServer` only knew `wrangler pages dev` (Cloudflare Pages) —
  extended with a `next start` branch (spawns the project's own `npm run start`, not an npx-resolved
  package) so `loop`/`verify-loop.js` can serve a Vercel-platform fixture locally too. `next start`
  specifically, not a static export — Proxy/Middleware doesn't run under `output: 'export'`.
- New `examples/nextjs-vercel` fixture: minimal Next.js App Router site (home, about, two posts),
  `.md` siblings for every page living as ordinary static files under `public/` (no markdown-mirror
  *route* needed — Next.js has no `.md.ts`-style convention to hand-roll, and `vercel.js`'s proxy
  only needs a `.md` file to exist at `<path>.md`, not how it got there). Checked in with both
  fixers already applied; `scripts/verify-loop.js` strips `app/not-found.js`, `public/robots.txt`,
  `proxy.js` back out to test the "before" state, same pattern as the Astro fixtures.
- `verify-loop.js`: added the `nextjs-vercel` fixture entry. Asserts `content-negotiation` flips
  fail → pass (confirmed: **fail → pass**, a real, verified delta — unlike the `danielkimdev.com`
  real-deploy test in NEXT_ACTIONS.md #2, this one actually moves). Doesn't assert
  `http-status-codes` — Next.js's own built-in 404 fallback already returns a real 404 with no
  fixer involved, so that check passes before and after on this fixture; only `content-negotiation`
  is the fixer's real contribution here. `overall` is gated at 0 by the missing `llms.txt`, same as
  both Astro fixtures — expected, not a bug (see `astro-cf-pages/README.md`).
- README/AGENTS.md: updated every "Astro (± Starlight) + Cloudflare Pages only" scope claim (status
  table, "Where this argument fully favors...", the GEO-comparison section, `lib/local-server.js`'s
  description, the architecture tree's `examples/` listing, the Node-version note) to include
  Next.js + Vercel and the new fixture. Two pre-existing gaps fixed in passing since the block was
  already being edited: the architecture tree was missing `astro-cf-pages` entirely, and the
  Node-version note didn't mention `next@16` needs Node ≥20.9 (CI's Node 22 already satisfies it).

### Verified

- `npm run lint` (syntax + the middleware-dedup regression check from the prior fix).
- `node src/cli.js enhance examples/nextjs-vercel` on the already-fixed fixture: all three files
  correctly skipped, confirming idempotency (the CONTRIBUTING.md testing requirement).
- `npm run verify-loop`: all three fixtures pass, including the new one —
  `afdocs check content-negotiation: fail -> pass` on a stripped `examples/nextjs-vercel` copy,
  served locally via the new `next start` support.
- One real debugging detour: a manually-installed `node_modules/` I'd left sitting in
  `examples/nextjs-vercel/` (from testing the fixture directly, outside `verify-loop.js`) got
  faithfully-but-corruptly copied by `fs.cp()` into each temp fixture copy — symlinked binaries
  like `node_modules/.bin/next` didn't survive the copy intact, producing two different confusing
  Next.js-internal errors (`Invariant: Expected workStore to be initialized`, then
  `Cannot find module '../server/require-hook'`) that had nothing to do with the fixer code. Root
  cause, not the errors' surface text: deleted the stray `node_modules`/`.next` so the fixture
  matches the other two (gitignored, installed fresh per temp copy by `ensureInstalled`) — resolved
  cleanly once isolated.

---

## v1.5.1 — Partial-Scan Resilience (NEXT_ACTIONS.md #15)

**Date:** 2026-09-10

### Changes

- `src/scan.js`'s `scanTarget()`: each scanner call now runs inside its own try/catch instead of
  one unguarded loop. A scanner that throws (Ora 429, a network blip) is pushed to an `errors` array
  instead of aborting the whole scan — the scanners that already succeeded still produce a report.
- `src/report.js`'s `buildReport()` takes that `errors` array as a third argument and records each
  failed scanner as `{ scanner, error }` under `report.scanners[name]`, plus a new top-level
  `report.partial: true` flag when any scanner failed. Nothing is silently dropped — `renderMarkdown()`
  prints a `**FAILED** — <message>` block for an errored scanner instead of assuming `.score`/`.checks`
  exist.
- `src/diff-report.js`'s `buildDiffReport()`: a scanner with `.error` set (in either the baseline or
  the re-scan) is now treated the same as an absent scanner — `comparable: false` with a reason
  naming which side failed and why, instead of crashing on a missing `.checks` array.
- `src/cli.js`: `scan` and `rescan` both print a warning line naming the failed scanner(s) when
  `report.partial` is true, via a new small `failedScannerNames()` helper.
- `SKILL.md` and `src/cli.js --help`: updated the Ora-429 guidance — it no longer says a rate limit
  "takes the whole scan down"; it now describes the partial report, `partial: true`, and the
  per-scanner `error` shape, and tells the agent to relay which scanner failed rather than treating
  the whole run as failed.

### Verified

- `npm run lint` (syntax check, 19 files).
- Inline smoke check (not committed as a test file — this repo has no test framework, only
  `scripts/verify-loop.js` and `scripts/check-syntax.js`): built a report with one healthy scanner
  and one `{ error }` scanner, asserted `report.partial`, the `FAILED` markdown block, and that
  `buildDiffReport()` marks the errored scanner `comparable: false` with a reason string naming the
  error while the healthy scanner still diffs normally.

---

## v1.6.0 — Multi-Site Compare + Score-Over-Time Monitor (NEXT_ACTIONS.md #14)

**Date:** 2026-09-10

### Changes

- New `src/compare.js`: `buildCompareReport(sites)` takes already-scanned `{ target, report }`
  pairs and renders an N-way per-scanner score/grade table (`renderCompareMarkdown`), written via
  `writeCompareReport()` as `compare-report.json`/`.md`. No new scanning logic — reuses each site's
  normalized report as-is, including the `{ error }` shape from v1.5.1's partial-scan handling
  (rendered as `FAILED: <message>` in a comparison cell instead of a blank).
- New `src/monitor.js`: `collectHistory(outRoot, target)` reads every `<outRoot>/*/report.json`
  (whatever `scan`/`rescan` already wrote), matches by the report's own `target` hostname (not by
  parsing directory-name conventions, which would break the moment a hostname itself contains a
  dash), and sorts oldest-first. `buildMonitorReport()` builds the score-over-time timeline and
  flags regressions between every consecutive pair of scans by reusing `buildDiffReport()`'s
  check-level fixed/regressed logic (not just an overall-score delta) — same approach
  `diff-report.js` already used, no new comparison logic invented.
- `src/cli.js`: two new commands.
  - `compare <url> <url> [<url> ...] [options]` — scans each target **one at a time**, not fanned
    out, because Ora's rate limit (10/min, 30/day) is per-IP and N concurrent distinct hosts would
    burn through it fast; writes each site's full report under `<out>/<hostname>/` plus the
    aggregate `compare-report.*` at the top of `<out>`.
  - `monitor <url> [--out-root <dir>] [--out <dir>]` — no new scanning; reads back what's already on
    disk. Defaults `--out-root` to `./out`.
  - New `--out-root` flag in `parseFlags`; factored the inline hostname-extraction IIFE in
    `outDirFor()` into a shared `hostnameFor()` used by both new commands too.
- `README.md`/`SKILL.md`: added both commands to the usage tables/examples and the output-files
  list; `--help` text extended with a `compare`/`monitor` paragraph each.

### Verified

- `npm run lint` (syntax check, 21 files).
- Inline smoke check per module (no test framework in this repo, same as v1.5.1): `compare.js`
  against two synthetic reports with different scores — asserted the per-target score fields and
  the rendered markdown table row. `monitor.js` against two synthetic `report.json` files written
  to a temp `out/` (same hostname, second one regressed a check from pass to fail) — asserted
  `collectHistory()` found both in order and `buildMonitorReport()` flagged exactly one regression,
  surfaced in the rendered markdown's "Regressions (1)" section.
- `node src/cli.js --help` manually reviewed for the new usage lines and option paragraphs.

---

## v1.7.0 — Site-Type Filtering (NEXT_ACTIONS.md #10)

**Date:** 2026-09-10

### Changes

- New `src/site-types.js`: `isApplicable(checkId, siteType)` and `applySiteTypeFilter(normalized,
  siteType)`. Ground-truthed against Ora's live check catalog (`GET https://ora.ai/api/checks`,
  fetched today — **184 checks** across discovery/access/usability/payments, not the "127" ora.js's
  own top-of-file comment claims; logged as a data point on NEXT_ACTIONS.md #8, not fixed there,
  since re-verifying `normalize()` itself is out of this item's scope). The exclusion set
  (`NOT_APPLICABLE_TO_CONTENT`) is deliberately a conservative subset, not all 184 checks classified:
  the entire Payments layer (9 checks, unambiguously commerce/API-specific) plus the API-transport
  checks named in NEXT_ACTIONS.md #10 and ISSUES.md's volatility entry as the motivating example
  (`openapi-spec`, `oauth-support`, `rate-limit-headers`, `api-versioning-policy`,
  `scoped-permissions`, `json-error-responses`, their close siblings, and the `public-api` check they
  all depend on). The other ~150 checks (MCP, GraphQL, accessibility, discovery-layer) were left
  alone — either broadly applicable regardless of site type or needing product judgment this tool
  has no authority to guess safely. is-agentic and Ora share this one map (`is-agentic` calls Ora's
  API with `include=essentials` — same check ids). afdocs' own checks are all inherently
  content/doc-site checks, so nothing needed excluding there.
- `applySiteTypeFilter()` marks each check `applicable: true|false` and — only for scanners that
  report per-check `earnedScore`/`maxScore` (afdocs, Ora; `is-agentic`'s `checks[]` only lists
  non-passing issues and never exposes per-check weights) — recomputes `score.overall` net of the
  excluded checks, flagged via `scoreAdjustedForSiteType`. `summary` is left as the scanner reported
  it; the excluded checks are always listed under `notApplicable` so nothing is silently hidden, even
  for `is-agentic` where the score itself can't be adjusted.
- `src/report.js`'s `buildReport()` takes a `{ siteType }` option, applies the filter per scanner,
  and records `report.siteType` (`"auto"` when omitted) at the top level. `renderMarkdown()` gained a
  "Not applicable for this site type" section per scanner, with a note on whether the score above was
  actually adjusted.
- `src/diff-report.js`'s `buildDiffReport()` compares `baseline.siteType` vs `rescan.siteType` and
  sets `siteTypeMismatch` when they differ; `renderDiffMarkdown()` prints a warning so a score delta
  isn't misread as a real fix/regression when it's actually a site-type change.
- `src/scan.js`'s `scanTarget()` validates `siteType` up front (before running any scanner — a typo'd
  value shouldn't burn Ora's rate limit before failing) and threads it into `buildReport()`.
  `src/loop.js`'s `runLoop()` threads it through too, for CLI/human parity.
- `src/cli.js`: new `--site-type <content|api|application|auto>` flag on `scan`/`rescan`/`compare`/
  `loop`. `rescan` defaults to the baseline report's own `siteType` when not overridden (so a plain
  re-run can't silently drift into a mismatch) and prints a warning if `diff.siteTypeMismatch` fires
  anyway. `--help` documents the flag.
- `README.md` (new Design notes entry, usage example), `SKILL.md` (usage example + guidance telling
  the agent to ask before applying it, since it changes the score's meaning), `ISSUES.md` (updated
  the `is-agentic` volatility entry: mitigated for `ora` directly, NOT resolved for `is-agentic`
  itself since its score can't be adjusted — entry stays open, not removed, per AGENTS.md's ISSUES.md
  rule).

### Verified

- `npm run lint` (syntax check, 22 files).
- Inline smoke check (no test framework in this repo, same pattern as v1.5.1/v1.6.0):
  `isApplicable()` against real check ids (`openapi-spec` excluded for `content`, included for `api`;
  a content-discoverability id always applicable; unfiltered when `siteType` is omitted).
  `applySiteTypeFilter()` against three synthetic scanner shapes — Ora-shaped (per-check weights
  present): score recomputed correctly excluding two API/payments checks, `scoreAdjustedForSiteType:
  true`. is-agentic-shaped (weights always null): score left unchanged, `scoreAdjustedForSiteType:
  false`, excluded check still listed in `notApplicable`. afdocs-shaped (no exclusions apply): pure
  pass-through, score unchanged. `buildReport()` with/without `siteType` (recorded field, filter
  applied only when opted in — confirms the "default stays unfiltered, additive only" requirement).
  `buildDiffReport()` between an `auto` baseline and a `content` re-scan: `siteTypeMismatch` correctly
  populated.
- `node src/cli.js --help` and a direct `scanTarget()` call with an invalid `--site-type` value
  (confirmed it throws before any scanner runs, not after).

## v1.7.0 — First npm Publish (NEXT_ACTIONS.md #12)

**Date:** 2026-09-10

### Changes

- No code changes. Published the existing `1.7.0` to the public npm registry: `npm publish` under
  the `danielkimdev` npm account, default access, tag `latest`. Package name `siteready` was
  unclaimed. 31 files, 56.2 kB tarball, matches the `files` field
  (`src/`, `scripts/`, `SKILL.md`, `README.md`, `CONTRIBUTING.md`, `LICENSE`) — no `examples/`,
  `out/`, or internal docs in the published tarball.
- npm printed a cosmetic auto-correct warning (`"bin[siteready]" script name was cleaned`) and
  rewrote `bin.siteready` in the repo's own `package.json` from `"./src/cli.js"` to `"src/cli.js"`
  (npm normalizes bin paths on publish, in place, not just in the published manifest). Committed
  as-is — functionally identical, `npm view siteready bin` confirms the registry copy resolves
  correctly. No action needed.

### Verification

- `npm whoami` confirmed the logged-in account before publishing.
- `npm view siteready version` returned 404 pre-publish (name free), then `1.7.0` post-publish.
- `npx --yes siteready@1.7.0 --help` from outside the repo (`/tmp`) printed the real CLI help,
  confirming the published package is installable and its bin entry resolves.
- README's `npm install -g siteready` / `npx siteready` quickstart (previously aspirational, per
  NEXT_ACTIONS.md #12) is now accurate — no README edit needed, it already documented both the
  published-package and source-checkout (`git clone` + `npm link`) paths correctly.

### Follow-up

- NEXT_ACTIONS.md #12 closed. Unblocks #16 (docs site + GitHub Pages), which can now show a real
  `npx siteready` quickstart.

## v1.7.0 — Docs Site via GitHub Pages (NEXT_ACTIONS.md #16)

**Date:** 2026-09-10

### Changes

- New `docs/`: `index.md` (landing pitch + quickstart), `install.md`, `cli-reference.md`,
  `contributing.md` (thin pointer to `CONTRIBUTING.md` at the repo root — not duplicated).
  Content adapted from README.md's existing Install/Usage/enhance sections; architecture and
  design-rationale detail stays README-only (linked, not copied) to avoid two sources of truth.
- `docs/_config.yml`: `theme: jekyll-theme-minimal`. Plain Markdown, GitHub Pages' built-in Jekyll
  build — no docs-generator dependency (ruled out Starlight: would've added a build step and a
  dependency with no home in `src/`, against AGENTS.md's tool-not-skill philosophy).
- Enabled GitHub Pages via `gh api -X POST repos/dkdev24/siteready/pages` with
  `source[branch]=main`, `source[path]=/docs` — no separate `gh-pages` branch, no Actions workflow;
  GitHub's own legacy Jekyll build handles it on every push to `main` that touches `docs/`.
- Live at https://dkdev24.github.io/siteready/.

### Verification

- `gh api repos/dkdev24/siteready/pages` before enabling returned 404 (Pages not yet configured);
  after the POST, returned `{"source":{"branch":"main","path":"/docs"},"html_url":"https://dkdev24.github.io/siteready/", ...}`.
- Manually re-read every new page for accuracy against the CLI's actual current behavior (commands,
  flags, output files) rather than re-deriving from memory, and for AGENTS.md's public-repo
  sanitization rule (no internal identifiers) — all content traces back to already-sanitized
  README.md prose.

### Follow-up

- NEXT_ACTIONS.md #16 closed.

## 2026-09-10 — README Trimmed to Docs Site (no version bump)

**Date:** 2026-09-10

### Changes

- README.md cut 421 → ~145 lines. Moved detailed/contributor-facing content out to the `docs/`
  site published in the entry above, replacing it in README with a short teaser + link:
  - "Why use this" + GEO-comparison essay (~82 lines) → new `docs/why.md`, full text preserved.
  - Architecture tree + Design notes + Cross-platform notes (~175 lines) → new `docs/architecture.md`,
    full text preserved.
  - Usage command list + output-file table + "How enhance works" → already covered by
    `docs/cli-reference.md` (written in the prior session); README now just has a 5-line teaser.
  - Fixer-by-fixer rationale (plain-Astro/Next.js scope limits) → appended to `docs/install.md`'s
    Status section.
  - Also corrected a stale claim carried over into `docs/why.md`: the GEO-comparison's "siteready
    doesn't have compare/monitor yet" line was already false as of v1.6.0 — fixed while moving it.
- Updated live cross-references that pointed at the now-moved README sections: `SKILL.md` (two
  spots), `AGENTS.md` (one spot), `CONTRIBUTING.md` (one spot) now point at `docs/architecture.md`
  / `docs/cli-reference.md` instead of "README.md Design notes" / "Cross-platform notes."
  Deliberately left `WORKLOG.md`'s own past entries and `siteready-plan.md` untouched — both are
  historical record (append-only / frozen respectively), not live documentation.
- Added a "Full docs site →" link at the top of README.md pointing at
  https://dkdev24.github.io/siteready/.

### Verification

- `npm run lint` passes.
- `grep` swept every `.md` file for "Design notes"/"Cross-platform notes" mentions after the cut to
  find stale in-repo cross-references, not just visually inspect the diff.

## 2026-09-10 — Voice Pass on Pitch Prose (no version bump)

**Date:** 2026-09-10

### Changes

- Daniel asked for a style pass. Scoped to the marketing/pitch prose drafted this session, not the
  engineering docs: README.md's intro + "Why use this" section, `docs/why.md`, and `docs/index.md`
  in full (it's entirely landing-page content). Left AGENTS.md/WORKLOG.md/NEXT_ACTIONS.md/HANDOFF.md
  and the technical reference docs (`install.md`/`cli-reference.md`/`architecture.md`) untouched,
  by explicit decision, since they carry the project's own established dense/technical convention
  rather than personal voice.
- Removed every em-dash and semicolon from the three files (Daniel's voice profile bans both,
  confirmed at 0.06 and near-zero per 1,000 words across his actual writing corpus). Converted each
  into a separate sentence, a plain connective (`but`/`so`/`and`), or a functional colon, checking
  colon density afterward against the displacement-check budget (~2 per 1,000 words) rather than
  just relocating the same tell onto a different mark. `docs/why.md` started at 14 em-dashes + 3
  semicolons + 11 colons and ended at 0 + 0 + 2.
- Also fixed one bold-first-bullet uniformity issue (all 4 GEO-comparison list items led with a
  bold label) and one middle-dot usage (`docs/index.md`'s footer links), both flagged by the same
  style-profile checklist as tells distinct from Daniel's real habits.
- No technical claims altered — every number, constraint, and example carried over verbatim;
  content was re-punctuated/re-sentenced, not rewritten for meaning.

### Verification

- `npm run lint` passes.
- Grepped each edited file for `—`, `;`, and `·` post-edit to confirm zero, not just visual
  inspection of the diff.

## v1.8.0 — Astro+Starlight / Cloudflare Pages Fixer: Five Gaps From Dogfooding docs-starlight

**Date:** 2026-09-11

Daniel ran `enhance` against the docs-starlight repo (real production Astro+Starlight docs
subdomain, no public API) some sessions back, then hand-fixed the gaps an ora.ai scan still flagged
(62 → 70, grade C → B). Asked this session to check that repo's fix commit and port whatever
generalizes back into `astro-starlight.js`/`cloudflare-pages.js`. Ported five of the eight; skipped
Organization JSON-LD `address`/`contactPoint` (real business data a fixer can't guess from
`astro.config.mjs`, unlike `name`/`url`/`sameAs` which already come from `starlight({ social })`)
and the separate near-miss-URL-redirect feature (from an earlier docs-starlight commit, not part of
the 62→70 gap set, and a bigger lift than the other five).

### Changes

- **`cloudflare-pages.js` middleware**: markdown negotiation now also fires on a known AI-bot
  User-Agent (`GPTBot`, `ClaudeBot`, `PerplexityBot`, etc.), not just `Accept: text/markdown` — most
  bots never send that header themselves. A markdown-preferring request that hits a path with no
  `.md` sibling now gets the `/404.md` mirror with a real 404 status instead of falling through to
  the HTML 404 page.
- **`astro-starlight.js` llms.txt split into a family**: `src/lib/llms-index.ts` (new) holds the
  shared section-grouping builder. `llms.txt` itself stays a full flat listing (every page, grouped
  by top-level content directory) as long as that fits under a 20,000-character threshold — this
  matters because `afdocs`' `llms-txt-coverage` check wants direct page links in `llms.txt` itself,
  not just pointers, and the fixture's baseline regressed from ~97 to 59 the first time this was
  tried with an unconditional split modeled directly on docs-starlight's (always-split) version.
  Past the threshold it falls back to a short nav index pointing at `llms-full.txt` (new, everything
  inline) and one dynamic `/<section>/llms.txt` per top-level content directory (new,
  `src/pages/[section]/llms.txt.ts` via `getStaticPaths` — one generic route, not N hardcoded
  per-section files like docs-starlight's manual version).
- **`astro-starlight.js` sitemap `<lastmod>`**: `src/lib/lastmod.ts` (new) walks `git log
  --name-status` once and maps content files to their latest commit date. `patchSitemapLastmod`
  wires `buildLastmodMap` into an *existing* bare `sitemap()` call's `serialize()` — skipped with a
  warning if the repo has no `@astrojs/sitemap` integration at all (Starlight's bundled sitemap
  generation doesn't expose a customization hook; this fixer won't guess at adding a new dependency)
  or if `sitemap()` already takes custom options (won't risk clobbering an existing `serialize()`).
- **`astro-starlight.js` NLWeb schema feed**: `schema-map.xml.ts` + `schema-feed.jsonl.ts` (new) —
  one `schema.org` `TechArticle` per doc page, JSON Lines, per the NLWeb Schema Feeds spec, with
  `dateModified` from the same `lastmod.ts`. A `schemamap:` directive pointing at it is added to
  `src/pages/robots.txt.ts` (new — Starlight sites commonly have no robots.txt at all; skipped with
  a warning if either a static `public/robots.txt` or a `src/pages/robots.txt.ts` already exists).
- All new llms.txt-family links are root-relative (not built from `astro.config`'s `site`) — the
  original single-file version already did this deliberately (see its inline comment) so the file
  keeps resolving under a preview deploy or the local test harness's `localhost` origin, unlike the
  configured production `site`. `robots.txt`/`schema-map.xml`/`schema-feed.jsonl` still use absolute
  `site`-based URLs, correctly, since the Sitemap directive and schema.org `url`/`@id` conventions
  require absolute URLs and aren't checked by `afdocs` today.
- Regenerated `examples/astro-starlight-cf-pages` and `examples/astro-cf-pages`'s checked-in
  `functions/_middleware.js` (and the Starlight fixture's `llms.txt.ts` + new files) to match, and
  extended `scripts/verify-loop.js`'s strip list for the new files so `verify-loop` actually
  exercises the new code paths.

### Verification

- `npm run lint` passes.
- `npm run verify-loop` passes for all three fixtures: `astro-starlight-cf-pages` afdocs score
  0 → 97 (A) — confirmed via a one-off debug script dumping the full per-check breakdown after
  catching and fixing the coverage regression above; `astro-cf-pages` and `nextjs-vercel`'s targeted
  checks (`http-status-codes`, `content-negotiation`) fail → pass as before.
- The example fixture has no `@astrojs/sitemap` integration, so the sitemap-lastmod path only
  exercises the "warn and skip" branch locally — the real docs-starlight repo (which does have an
  explicit `sitemap()` call) is where that wiring was verified against real content.

## v1.9.0 — `install-skill`: Install SKILL.md Into Claude Code, Codex CLI, and OpenCode

**Date:** 2026-09-11

Daniel wants npm package users to be able to install siteready's own `SKILL.md` into popular agent
tools via the CLI, not just Claude Code. Planned first (researched Codex CLI's and OpenCode's
current skill-discovery conventions via a subagent, since these evolve fast and guessing from
training data would've been unreliable), then implemented against that plan.

### Changes

- **`src/skill-install.js`** (new) — orchestrator. Resolves the running package's own root
  directory, reads its `SKILL.md` once, and dispatches to the requested agent installer(s). Warns
  if the resolved root looks like a temporary/npx cache path (`os.tmpdir()` or an `_npx` path
  segment), since a baked-in absolute path wouldn't survive that cache being evicted.
- **`src/installers/claude.js`** (new) — writes `.claude/skills/siteready/SKILL.md` (project) /
  `~/.claude/skills/siteready/SKILL.md` (`--global`) **verbatim**. Claude Code tells the agent its
  own skill's base directory at load time (a system-reminder), so `SKILL.md`'s literal
  `<skill-dir>` placeholder is left for Claude itself to resolve — no rewriting needed.
- **`src/installers/agents-skill.js`** (new) — shared by the `codex` and `opencode` agent ids, both
  of which discover skills at the same `.agents/skills/siteready/SKILL.md` (project) /
  `~/.agents/skills/siteready/SKILL.md` (`--global`) path (confirmed via research: OpenCode also
  reads `.claude/skills/` directly, but neither Codex nor OpenCode documents an equivalent to
  Claude Code's load-time base-directory signal, so the safer default is baking `<skill-dir>` into
  a real absolute path at install time instead of leaving it for the agent to resolve). Installing
  either `codex` or `opencode` installs both, since they share one file.
- **`src/cli.js`**: new `install-skill <agent...> [--global] [--force] [--uninstall]` subcommand,
  positional-args-then-flags parsing mirrored from the existing `compare` command. Reuses the same
  written/skipped/warnings reporting shape `enhance` already prints.
- **`package.json` `files` fix**: added `docs/` — it was missing entirely, so `SKILL.md`'s "More
  detail" links to `docs/architecture.md`/`docs/cli-reference.md` already 404'd for anyone who
  installed via npm instead of git-cloning the repo. Unrelated to `install-skill` itself but exposed
  by it (an installed skill is exactly the scenario that hits those links) — fixed alongside it
  rather than filing separately.
- **Installer contract documented** in `CONTRIBUTING.md` (new "Adding an agent skill installer"
  section, same `{ written, skipped, removed, warnings }` shape as a fixer, plus the
  bake-vs-leave-the-placeholder judgment call), `AGENTS.md`'s Key Paths table, and
  `docs/architecture.md`/`docs/cli-reference.md`.
- A ponytail-audit pass on the repo (unrelated to this feature, run earlier the same session) also
  landed: `src/report.js`/`compare.js`/`monitor.js`/`diff-report.js` each had a near-identical
  `write*Report` function (mkdir + write `.json` + write `.md`) — collapsed into one
  `writeJsonAndMarkdown` helper in `src/lib/write-report.js`. The audit's other finding (`--site-type
  api`/`application` behave identically to `auto`, no differentiation logic exists for either) was
  deliberately **not** applied — removing them would break a documented, already-released public CLI
  flag; left as-is per Daniel's call.

### Verification

- `npm run lint` and `npm run verify-loop` pass (all three fixtures).
- Manually verified `install-skill` end-to-end in a scratch directory: install/skip-if-exists/
  `--force`-overwrite/`--uninstall` for `claude`+`codex`+`opencode`, an unknown agent name rejected
  with the supported list, the Claude copy keeping all 16 `<skill-dir>` occurrences literal, the
  shared agents copy having zero left after baking, and the npx-cache warning firing under a
  simulated `_npx/<hash>/` path.
- Confirmed `writeReport`/`writeCompareReport` still produce identical output after the
  `writeJsonAndMarkdown` refactor.

### Deferred

- Cursor (`.cursor/rules/*.mdc`), Windsurf (`.windsurfrules`/`.windsurf/rules/`), and Aider (a flat
  conventions file, no directory convention at all) have no comparable skill-discovery namespace —
  intentionally not wired up; see `docs/architecture.md`'s design note.

---

## v1.10.0 — `scan-local` Command

**Date:** 2026-09-11

### Changes

- Daniel's prompt: `loop` already builds/serves a local repo checkout and tunnels it for hosted
  scanners with no public URL, but only as part of the full scan -> enhance -> rescan -> diff
  cycle. There was no way to run just the baseline scan against a repo before its first deployment.
- **`src/loop.js`**: added `runScanLocal(repoPath, opts)`, a sibling to `runLoop` that reuses the
  same `startScanTarget` helper (build -> serve -> optional Quick Tunnel -> scan -> stop) but skips
  `enhance`/rescan/diff entirely — one report out. Gates on `stack.platform` being one
  `startLocalServer` can run (`cloudflare-pages`/`vercel`) rather than `stack.supported`, since
  `supported` is `enhance`'s fixer-availability check and would wrongly reject, e.g., plain Astro
  without Starlight or any other framework on a supported platform with no fixer yet.
- **`src/cli.js`**: new `scan-local <repo-path> [options]` subcommand — same `--scanners`/
  `--sampling`/`--site-type`/`--port`/`--out` flags as `scan`/`loop`, same report-writing shape as
  `runScanCommand`. Help text, README quickstart, `docs/cli-reference.md`, and the `src/` key-paths
  comments in README updated alongside.

### Verification

- `npm run lint` and `npm run verify-loop` pass.
- Ran `node src/cli.js scan-local examples/astro-starlight-cf-pages` end-to-end: builds the
  fixture, starts a local Cloudflare Pages preview, scores afdocs 97/100, writes report.json/
  report.md — no public URL involved anywhere in the run.

---

## v1.10.1 — Rename `examples/` to `fixtures/`

**Date:** 2026-09-11

### Changes

- Daniel's prompt: are the three projects under `examples/` "before enhance" samples? No — they're
  checked in already-enhanced, and `scripts/verify-loop.js` reconstructs "before" on the fly in a
  temp copy by stripping each fixer's known output back out. Follow-up made the actual point: this
  reads as an internal CI/test-fixture directory, not user-facing example projects — confirmed by
  `package.json`'s `files` list never including it (it never ships to npm) and no scan/enhance/loop
  usage doc ever pointing a user at it.
- `git mv examples fixtures`, plus every path reference updated: `scripts/verify-loop.js`,
  README.md, AGENTS.md, CONTRIBUTING.md, NEXT_ACTIONS.md, docs/architecture.md, docs/why.md,
  docs/install.md, `.github/ISSUE_TEMPLATE/new-framework-fixer.md`, and each fixture's own
  README.md (`cd tools/siteready/examples/...` → `.../fixtures/...`). Each fixture's `package.json`
  `name` field (`examples-*` → `fixtures-*`, private/unpublished, only for local installs) and the
  matching two `name` fields in its `package-lock.json` updated to match.
- `siteready-plan.md` (frozen design doc) and this file's own past entries intentionally left
  referencing the old `examples/` path — historical record, not current state.

### Verification

- `npm run lint` and `npm run verify-loop` pass post-rename (all three fixtures, including the
  Next.js one after its `package.json`/`package-lock.json` name edit).
- `git status` confirmed clean renames (`R`/`RM`, no content diff beyond the `name` field edits) —
  no stray npm-lockfile version noise picked up along the way.

---

## v1.11.0 — Jekyll + GitHub Pages fixer

**Date:** 2026-09-11

Triggered by dogfooding `enhance` against this repo's own `docs/` site (published via GitHub
Pages, Jekyll, `jekyll-theme-hacker`): it had no fixer at all — `detect-stack.js` only recognized
Astro/Next.js via a root `package.json`, and a classic GitHub Pages Jekyll site typically has none.

- `src/detect-stack.js`: added a Jekyll check that runs *before* the `package.json` branch and
  short-circuits independently of it — a Jekyll site needs no `package.json`, and a repo can have
  an unrelated one at its root (this repo's own CLI `package.json`, sitting next to `docs/`'s
  Jekyll site, is exactly that case). Looks for `_config.yml` at the repo root or `/docs` (GitHub
  Pages' two supported source locations) and returns a new `siteRoot` field pointing at whichever
  one has it.
- `src/enhance.js`: now resolves `stack.siteRoot ?? resolved` and passes that to both fixers,
  instead of always the repo root — additive, existing Astro/Next.js fixers still get the repo
  root exactly as before since they never set `siteRoot`.
- `src/fixers/jekyll.js` (new framework fixer): declares `jekyll-sitemap` + `jekyll-seo-tag` in
  `_config.yml`'s `plugins:` list (both are in GitHub Pages' native-build plugin whitelist, no
  Gemfile needed) via a small regex-based list editor, not a real YAML parser (`ponytail:` comment
  marks the ceiling — ✅ block list, flow list, and no-`plugins:`-key cases, ❌ inline comments on
  the same line as an entry). Also writes `_includes/head-custom.html` with `{% seo %}` (the
  extension point every `github.com/pages-themes/*` theme includes from its own `head.html`,
  documented as the way to add `<head>` content without overriding the whole layout), `404.md`
  (real 404 status via Jekyll's `permalink: /404.html` front matter, short recovery body), a
  permissive `robots.txt`, and an `llms.txt` stub seeded from `_config.yml`'s `title`/`description`
  (warns that the "when to use this" section stays manual — same call as NEXT_ACTIONS.md #3 for
  every other fixer).
- `src/platforms/github-pages.js` (new platform fixer): writes nothing — GitHub Pages' classic
  build is purely static, no request-header branching available the way Cloudflare Pages Functions
  or Vercel middleware provide it, so `markdown-negotiation-vary` is structurally unfixable there.
  Exists only so `enhance`'s warning list says so explicitly instead of the check silently staying
  broken.
- Registered both in `src/enhance.js`'s `FRAMEWORK_FIXERS`/`PLATFORM_FIXERS`, updated the
  "supports X" text in `src/cli.js --help` and `detect-stack.js`'s unsupported-combo message, and
  `package.json`'s npm description.

**Follow-up same session, prompted by a direct question, then reverted:** the site's docs pages
are already markdown pre-render — asked whether that could feed the markdown-negotiation checks.
Two different checks turned out to need two different answers. afdocs' `markdown-negotiation-vary`/
is-agentic's same-named check are Accept-header-on-the-same-URL negotiation, structurally
impossible on GitHub Pages (no header/redirect control at the CDN edge, true for both the classic
branch build and an Actions-based one) — stays an accepted gap.

afdocs' separate `markdown-url-support` check (`GET /page.md` returns markdown) *is* pure static
file serving, so a first pass built `mirrorMarkdownSiblings()`: Jekyll only converts a file with
YAML front matter; front-matter-less, it's copied verbatim via `Jekyll::StaticFile`. A front-
mattered page's own output goes to `<slug>.html`, never `<slug>.md`, so renaming the source to
`<slug>.markdown` (equally "convertible" in Jekyll's default `markdown_ext` list, same HTML output)
frees the `.md` filename for a static copy of the raw body. Mechanism verified against documented
Jekyll `Convertible`/front-matter behavior rather than an actual local build — this machine's
system Ruby (2.6.10) is too old for a current `jekyll` gem (`rouge` needs Ruby ≥2.7) and standing
up a second Ruby just to confirm well-established behavior wasn't worth it.

**Reverted after Daniel pushed back**: this turns one file into two (`<slug>.markdown` +
`<slug>.md`) that must stay byte-identical apart from front matter, and the fixer's own
idempotency check (skip once the `.md` has no front matter) never re-synced them — editing the
`.markdown` source and forgetting to re-run `enhance` silently drifts the two out of sync, and nothing
would have caught it. Presented three options (regenerate-on-enhance + a CI drift check;
migrate GitHub Pages to an Actions build so the mirror is generated fresh every deploy, never
hand-maintained; or drop it). Daniel chose to drop it — not worth ongoing maintenance risk for one
check on a 7-page docs site. `git mv`'d every `<slug>.markdown` back to `<slug>.md` (restores the
original tracked content exactly — confirmed via `git diff`), removed `mirrorMarkdownSiblings()`
and the `readdir` import from `jekyll.js`, and left a one-line warning in `applyJekyllFixes()`
explaining the check is a deliberately accepted gap so a future session doesn't retry it blind.

### Verification

- `node src/cli.js enhance .` against this repo: detected `jekyll + github-pages`, wrote
  `docs/_config.yml` (plugins added), `docs/_includes/head-custom.html`, `docs/404.md`,
  `docs/robots.txt`, `docs/llms.txt`.
- Re-ran `enhance .`: everything skipped as already-present — confirms idempotency per
  CONTRIBUTING.md's fixer-testing checklist.
- `npm run lint` passes; `git diff --stat docs/` after the mirror revert shows only `_config.yml`
  changed among originally-tracked files — every page's content matches its pre-session commit.
- **Not yet verified live**: these files are only in the local working tree, not pushed/rebuilt/
  rescanned against `https://dkdev24.github.io/siteready/` yet — see NEXT_ACTIONS.md #17.
