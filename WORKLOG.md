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

---

## v1.4.1 — Middleware collision guard + llms.txt as a real nav index

Both changes came out of dogfooding round 2: a hosted agent journey was run
against the same production Astro + Starlight docs subdomain used in earlier
rounds, and its narrative (not its score) exposed two defects in siteready's
own fixer output.

### 1. `cloudflare-pages.js` wrote a second middleware onto an occupied route

The guard checked `existsSync(functions/_middleware.js)` — the exact filename
it writes. The target repo's middleware was `_middleware.ts`, so the guard
missed and `enhance` added `_middleware.js` beside it. Cloudflare Pages
resolves `functions/_middleware.<ext>` **by route, not by filename**, so those
two files are the same route: shipping both is a collision, and which one wins
is up to the build. Worse, the file we added carried only the markdown
negotiation, while the existing one also carried origin-scoped CORS for an
embedded widget — so a build that picked ours would have silently dropped
working behavior.

Fixed by guarding on every extension Pages accepts (`js`, `mjs`, `jsx`, `ts`,
`tsx`), naming the file that already claims the route in the skip message, and
emitting a warning when a repo is *already* in the collided state (more than
one root middleware present) — which is how the affected repo was found.

Verified across all five states — none, `.js`, `.ts`, `.tsx`, and both `.js`
and `.ts` — with the last correctly producing a skip plus a warning and no
new file.

### 2. The generated `llms.txt` was a flat list of `.md` URLs

The journey's verdict on the site was that `/llms.txt` "documented URL
structure but did not provide a browsable nav index," which sent the agent to
web search to find pages the site already published. That file was our
template's output, verbatim: one `## Docs` heading over a flat list, `.md`
URLs only, no hierarchy, no canonical HTML URLs, and no statement of the URL
structure.

Rewritten to emit a navigable tree: group by top-level section, then by
second-level directory — but only where a directory actually has pages below
it, so a leaf page two levels deep doesn't become a bogus section heading of
its own. Each entry now carries the canonical HTML URL *and* the `.md` URL. A
"URL structure" preamble lists the real top-level sections and says outright
that a shortened guess is not a valid URL and the index is authoritative. The
404 page is excluded (it is a routing artefact, and it was otherwise showing
up as a top-level section). Section headings title-case the directory name,
since a fixer can't invent a site's product names — the generated file says so
and invites replacing them.

This is a behavior change to a shipped fixer rather than a new additive one,
which AGENTS.md's plugin rule would normally discourage. Judged in-bounds: the
fixer only ever writes this file when it is absent, so no already-enhanced repo
is touched by the change, and the old output was the exact defect a scanner
journey called out.

Verified by deleting the fixture's `llms.txt.ts`, re-running the fixer,
building, and reading `dist/llms.txt` — correct hierarchy, both URL forms per
page, no 404 section. `npm run lint` clean; `npm run verify-loop` green for
both fixtures (afdocs `http-status-codes` and `content-negotiation` still move
fail -> pass).

### Also filed, not built

NEXT_ACTIONS.md #16 (near-miss 404 path resolution as a fixer) and #17 (a check
for internal links inside MDX component props — `starlight-links-validator`
misses them, and a dead homepage card survived a green build because of it).
Both were implemented and verified by hand on the dogfooded site first; only
the generic write-ups are here.

ISSUES.md gained an entry on the underlying observation: that site scored 72/D
and 97/A while its homepage had a dead card and every shortened URL 404'd. The
scorecards missed both. The Ora journey prose caught them, and `ora.js`
currently normalizes per-check results and throws that prose away.


---

## v1.5.0 — Near-miss path resolution + `siteready lint`

Both of these were filed one session earlier (NEXT_ACTIONS #16, #17) after being
implemented and verified by hand on a real production docs site. This session
generalized them into the tool, which is where the interesting differences from
the hand-written versions showed up.

### Near-miss path resolution (`src/fixers/near-miss.js`, new)

A 404 on a plausible-but-wrong path is a dead end for an agent: nothing on the
page tells it what the real URL is, so it leaves and searches. The fix is two
halves that are useless apart — a build-time `/url-index.json` (every canonical
URL, the directory list, a slug -> URL map, and an optional per-site alias
table that defaults to empty) and a middleware branch that consults it on a 404
and 301s to the canonical page. They live together in one module rather than
being split across `fixers/` and `platforms/`, since neither ships alone.

The hand-written original filtered candidates by an explicit `/ko/` locale
check. A fixer can't know a site's locales, so the generic version derives the
same behavior from the index: if a request opens with a segment that is itself
a real top-level directory, candidates are scoped to it — which is exactly what
a locale prefix looks like — and remaining ties break on path depth, so a page
mirrored under a locale prefix loses to the shallower canonical one. Verified
by running the generic resolver against the real multi-locale site's own
`url-index.json`: it matched the hand-tuned version on all ten reported paths,
including both Korean ones.

That cross-check also caught a real regression in the first draft. Scoring
started at `best = 0` and only collected winners when a candidate scored above
it, so a single-segment guess (`/license-token/`) — which has no context
segments to score against — produced no winner and fell through to a 404, where
the hand-written version had resolved it. Fixed by falling through to the depth
tie-break over all candidates when nothing scores, which is safe: genuinely
ambiguous same-depth candidates still tie, and a tie still means no redirect.

Verified live rather than only in unit form: built the fixture, served it with
`wrangler pages dev`, and confirmed `/guides/configuration/` and
`/docs/getting-started/` return 301 to the right pages, `/nothing/here/` still
returns 404, and a real page still returns 200.

The resolver no-ops when `/url-index.json` is absent (it caches the miss so a
404-heavy site doesn't re-request it every time), which is what keeps it safe
for the plain-Astro fixer path, where no index is written.

One consequence worth stating: for a repo that already has a middleware, the
platform fixer correctly refuses to touch it — so that repo gets the index route
but not the resolver. The skip now comes with a warning saying exactly that, and
what to copy where.

### `siteready lint` (`src/lint.js`, new)

`starlight-links-validator` and its equivalents walk the markdown AST, so they
see `[text](/path/)` and nothing else. They do not see `href` on a component or
`link:` in frontmatter — which is how Starlight hero actions and every card
component are written. The site this came from shipped a dead product card on
its homepage through a green build, a green link validator, and three green
scanners.

`lint` reads the repo's build output rather than a served URL, which is both why
it needs a build first and why it's exact: a link is broken iff nothing in the
build answers it. It got its own CLI verb rather than folding into `scan`
because that difference in input is real — `scan` takes a URL, `lint` takes a
checkout — and blurring it would have made `scan` mean two things. Exits
non-zero on findings so it can gate CI.

Regression-tested against the original defect: re-breaking that homepage link
produces exactly one finding with file and line, and exit 1; the repaired tree
reports 249 links across 482 source files, all resolving.

### Verification

`npm run lint` clean (19 files). `npm run verify-loop` green for both fixtures
after the middleware change — afdocs `http-status-codes` and
`content-negotiation` still move fail -> pass. Live `wrangler pages dev` check
as described above.
