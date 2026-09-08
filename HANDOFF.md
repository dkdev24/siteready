# HANDOFF.md

Cross-session context memory. Update this file at the end of every session.

---

## Current Version

**0.7.1** (doc-tracking system's own version — see WORKLOG.md; the underlying
CLI/engine is now at package.json's `1.3.1`, to be tagged `v1.3.1` in git)

---

## Project Status

siteready is a CLI orchestration + remediation layer for "agent-readiness" website
scanning. It runs a site through multiple scanners (afdocs, Vercel Is Agentic, Ora),
normalizes results into one scorecard, auto-fixes issues its fixers support
(Astro + Starlight, and now plain Astro without Starlight, both + Cloudflare
Pages), then re-scans and produces a before/after diff — fully local, no live
deployment required. v1.0 shipped the Astro+Starlight+Cloudflare-Pages fixer
(fresh Starlight site: 0/100 F → 97/100 A on afdocs). v1.1 adds a second,
intentionally-narrower fixer for plain Astro sites with no Starlight. v1.2 adds
a third scanner, Ora (the engine behind Vercel's Is Agentic — its full
127-check ranker instead of Is Agentic's simplified essentials-only subset;
made opt-in rather than default in v1.2.1, since is-agentic's score is a
strict subset of the same Ora data). v1.3 adds a way to stay current with
scanner-engine updates without editing siteready: `AFDOCS_VERSION`/
`IS_AGENTIC_VERSION` env-var overrides plus `npm run check-scanner-versions`.

**Not yet a version bump:** `loop` + Cloudflare Quick Tunnel support
(`src/lib/tunnel.js`) is written, lint-clean, and doesn't regress the
existing afdocs-only path (`verify-loop` still passes) — but its core
mechanism (the tunnel actually being reachable) tested unreliable in this
session (1 success in 4 attempts) and a fix-vs-fallback decision is
pending. See Next Actions #1 (now the top item) before treating this as
shipped. Package.json intentionally stays at `1.3.1` until that's resolved.

---

## Last Session (2026-09-09, loop + hosted scanners via tunnel — UNVERIFIED, decision pending)

User's framing: `loop`'s scan→enhance→rescan→diff-report only works for
afdocs (fetches the URL itself, `localhost` is fine); is-agentic/ora are
*hosted* — their crawler runs on Vercel's/Ora's own infrastructure and can
never reach `localhost` — so `loop` has hard-rejected them since v0.4,
forcing a real deployment to validate a fix with those two. Asked whether
that hurdle has a resolution short of production deployment or localhost.

Landed on Cloudflare Quick Tunnels (`cloudflared tunnel --url`, no account/
signup, ephemeral `*.trycloudflare.com` URL) as the mechanism — user chose
this explicitly over `localtunnel` and over "just document the limitation."
Built:
- `src/lib/tunnel.js` (new): `startTunnel(localUrl)` spawns `cloudflared`
  via `spawnNpxCli`, parses the `*.trycloudflare.com` URL from its log
  output, self-checks reachability (`fetch`) before returning, plus a fixed
  8s settle buffer (`PROPAGATION_BUFFER_MS`) — added after a first test hit
  Ora returning `"Domain is not reachable"` on a scan attempted right after
  the URL was printed, before the route had propagated to Ora's own network
  path.
- `killProcessTree` extracted from `lib/local-server.js` into
  `lib/npx-runner.js` (shared, since `tunnel.js` needed the identical
  Windows-`taskkill /t`-vs-POSIX-process-group teardown logic — no
  behavior change to `local-server.js`, pure move).
- `loop.js`: replaced the hard `throw` on `is-agentic`/`ora` with
  `startScanTarget()` — starts the local server, and if a hosted scanner
  was requested, layers a tunnel on top and scans through that URL instead.
  Falls back to the plain local server (today's behavior) when only afdocs
  is requested — **zero regression risk**, confirmed via `npm run
  verify-loop` still passing after these changes.
- `cli.js --help` updated to describe the tunnel behavior and its exposure
  window.

**Verification result: inconclusive, not a clean pass.** First full
end-to-end test (`loop` against `examples/astro-cf-pages` with
`--scanners ora`) failed: Ora's API returned `"Domain is not reachable"`.
Root-caused to a propagation race (confirmed by hand: a `curl` against the
same URL succeeded ~1s after cloudflared printed it, but Ora's crawler,
hitting the tunnel from a different network path, hadn't converged yet) and
added the reachability self-check + buffer above to fix it. Re-tested
three more times (once through the real `loop`, twice via a standalone
`startTunnel()` script) — all three hit a **DNS resolution failure**
(`ENOTFOUND` for the `*.trycloudflare.com` hostname), reproduced identically
via both `curl` and Node's `fetch` (ruling out a Node/`fetch`-specific
bug). Net: 1 success out of 4 total attempts. cloudflared's own banner
text says exactly this outright: "these account-less Tunnels have no
uptime guarantee." Unclear how much of this is inherent to anonymous Quick
Tunnels vs. this specific sandbox's network path — not something resolvable
without testing from a normal, non-sandboxed network.

Presented three options, none implemented pending the user's decision next
session (see Next Actions #1):
1. **Retry with a fresh tunnel on failure** (new random subdomain per
   attempt — a failed resolution isn't obviously correlated with the next
   attempt's subdomain, so a few retries should push effective reliability
   much higher). Keeps zero-signup simplicity; adds latency on the unlucky
   path. Not yet built.
2. **Named Cloudflare Tunnel** (needs a free CF account +
   `cloudflared tunnel login`, a real DNS record instead of an anonymous
   quick-tunnel subdomain) — likely far more reliable, reintroduces the
   account requirement Quick Tunnels exist to avoid.
3. **Roll back** — drop `tunnel.js`/the `loop.js` wiring, restore the
   hard-reject, document the limitation instead (real deployment still
   required for is-agentic/ora validation, same as pre-this-session).

Committed as WIP specifically because it's additive/opt-in and provably
doesn't regress the default path — not because the feature itself is
considered done. Do not describe "loop supports hosted scanners" as
shipped/working until the reliability decision above is made and re-verified.

---

## Last Session (2026-09-09, value-proposition doc)

User asked a sharp question: since every scanner already returns a
`fix`/`recommendation` string per failing check, does siteready still add
anything over an agent with repo access just calling the scanners directly
and acting on that text? Talked it through, then wrote the conclusion into
README.md as a new "Why use this, instead of pointing an agent at the
scanners directly?" section (right after Status, before Usage — read before
Usage instructions, not buried after them). Docs-only change, no version
bump — nothing about the running tool changed.

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
today — which reframes the roadmap as "fixer/platform coverage is the
moat," not scanner count (ties back to `ora` being made opt-in rather than
a fourth default scanner).

---

## Last Session (2026-09-09, weekly CI wiring)

Wired `check-scanner-versions.js` into `.github/workflows/scanner-version-check.yml`
(scheduled, Monday 09:00 UTC + `workflow_dispatch`): runs the script, and
when a pin is behind, files or updates a single `scanner-version-drift`-labeled
issue (`actions/github-script`, dedupes by searching for an existing open
issue with that label before creating a new one) — never bumps the pin
itself, same "re-verify `normalize()` first" rule as everywhere else.

Added a small `GITHUB_OUTPUT` write to `check-scanner-versions.js` (only
fires when that env var is set, i.e. inside Actions — a plain local
`npm run check-scanner-versions` is unaffected) so the workflow can branch
on `steps.check.outputs.behind` without re-parsing stdout. Validated the
new workflow YAML with `npx js-yaml` (no local `yamllint`/PyYAML available)
and confirmed the `GITHUB_OUTPUT` write with a manual env-var simulation
before committing — couldn't dry-run the actual scheduled trigger locally.
`package.json` bumped to `1.3.1` (patch — wiring existing tooling into CI,
not new functionality).

---

## Last Session (2026-09-09, scanner-version freshness)

User asked how to keep scan results on the latest scanner engines without
having to update siteready itself — agent-readiness scanning is a young,
fast-moving category. Answer split by scanner type:

- **Ora already solved:** no version pin at all — direct API call, so every
  scan is automatically on Ora's latest engine. Nothing to build.
- **afdocs/is-agentic are deliberately pinned** (see AGENTS.md's Standing
  Development Rules) because both CLIs are young enough that a breaking
  JSON-schema change upstream could silently corrupt `normalize()`. Floating
  the pin re-opens exactly the risk it exists to prevent, so didn't do that.

Built the middle path instead, in both `scanners/afdocs.js` and
`scanners/is-agentic.js`:
- Exported `PACKAGE_NAME`/`PINNED_VERSION` constants (previously an
  unexported single `PACKAGE_SPEC` string).
- `PACKAGE_SPEC` now resolves as `` `${PACKAGE_NAME}@${process.env.<X>_VERSION ?? PINNED_VERSION}` ``
  — an `AFDOCS_VERSION`/`IS_AGENTIC_VERSION` env var overrides one run's
  CLI version with no source edit, while the default stays pinned for
  everyone else.
- Added `scripts/check-scanner-versions.js` (`npm run check-scanner-versions`):
  fetches each package's latest version from `registry.npmjs.org/<pkg>/latest`
  and diffs against the pinned constant — reports drift, changes nothing.
  Doesn't cover `ora` (nothing to check — no pin exists).

Documented the decision in three places so it doesn't need re-explaining:
AGENTS.md's pinned-CLI-versions rule, README.md's Design notes (new
"Staying current without floating the pin" bullet), and `cli.js --help`.
`package.json` bumped to `1.3.0` (minor — new tooling/mechanism, not just a
fix).

---

## Last Session (2026-09-08, Ora scanner)

Added `src/scanners/ora.js`: a third scanner adapter, direct-API (no CLI
exists for Ora) against `POST https://ora.ai/api/scan?format=audit`,
keyless for reads. Prompted by the user finding
https://ora.ai/blog/is-agentic-with-vercel — is-agentic.com is a Vercel
front end over this same Ora API with `include=essentials` (a simplified
80/20/5-point subset); the full ranker scores 127 checks across four layers
(discovery, accessibility, usability, payments), including an entire
payments/checkout layer is-agentic's subset skips. Registered in
`SUPPORTED_SCANNERS` (`src/scan.js`), and added to `loop.js`'s
hosted-scanner-can't-reach-localhost guard alongside `is-agentic` (was a
single `if`, now filters a list so a third hosted scanner doesn't need a
third near-duplicate check).

Verified against a real target (`https://vercel.com`) via both the raw
adapter and the full `node src/cli.js <url> --scanners ora` CLI path —
125 checks, correct score/grade/category rollup, `report.md` renders
cleanly. One field-mapping bug caught this way: Ora's own `url` response
field is its *report-page* URL (`https://ora.ai/vercel.com`), not the
scanned site — the actually-scanned target is `finalUrl`. Fixed before
committing; `normalized.target` now reads `finalUrl`, and a new
`reportUrl` field carries Ora's `url` (matches `is-agentic.js`'s existing
`reportUrl` convention).

README.md updated: scanner table, `raw/` output list, adapter-contract
section (new "exception to the npx-runner rule" note explaining why
`ora.js` uses `fetch()` directly), and the existing `is-agentic` caching
caveat now cross-references that Ora's API exposes a real `force` param
(unlike is-agentic's CLI) — `runOraScan` just doesn't default to it, to
conserve the API's 6-forced-scans/day quota.

Not yet done: no CI fixture coverage for `ora.js` (parallel to Next
Actions #1 for the plain-Astro fixer) — `verify-loop.js` only exercises
`afdocs` today since `loop` can't reach hosted scanners at all. A
live-URL smoke test would need the same "real deploy" prerequisite as
Next Actions #2.

**Follow-up same session:** user pushed back on `ora` being in the default
scanner set — correctly pointed out `is-agentic`'s score is a strict subset
of `ora`'s (same API, `include=essentials`), so running both by default on
every `scan`/`rescan` just doubles hosted-API cost for overlapping data,
with no fixer yet acting on `ora`'s extra checks to justify it. Added
`DEFAULT_SCANNERS` (`is-agentic`, `afdocs`) separate from `SUPPORTED_SCANNERS`
(all three) in `src/scan.js`; `ora` is now opt-in via `--scanners ora`.
Documented the reasoning (and the future consolidation path — retire
`is-agentic.js` in favor of `ora.js` + `include=essentials` if an
`ora`-specific fixer ever ships) in README.md's Design notes.

---

## Last Session (2026-09-08, continued)

Closed Next Actions #1: added `examples/astro-cf-pages/` — a from-scratch,
minimal plain-Astro (no Starlight) site (home + about + a 3-entry `posts`
collection with hand-rolled `.md.ts` mirror routes), checked in with
`astro.js`'s fixer output already applied (matches the Starlight fixture's
"checked in after" convention). Wired it into `scripts/verify-loop.js`,
which now loops over both reference fixtures instead of hardcoding the
Starlight one.

Key finding while wiring this up: afdocs' `overall` score is **gated** on
`llms-txt-exists` — every other `categoryScores` entry comes back `null`
whenever that check fails, so `overall` reads `0` both before and after
`astro.js` runs, even though the fixer's actual targets
(`http-status-codes` via the new `404.astro`, `content-negotiation` via the
Cloudflare Pages middleware) genuinely flip from `fail` to `pass`. Confirmed
by hand: added a `src/pages/index.md.ts` mirror for the root page (afdocs'
crawler apparently only tests the single seed page when there's no
`llms.txt` to discover more from) and diffed the full check list before vs.
after — `overall` stayed `0 -> 0` while the two targeted checks flipped
correctly. `scripts/verify-loop.js`'s `astro-cf-pages` fixture now asserts
on those individual checks instead of the gated `overall` score; documented
the same reasoning in `examples/astro-cf-pages/README.md` so it isn't
re-discovered from scratch next time. `markdown-url-support` was originally
in the target-check list too but dropped — it already passes pre-enhance
since the fixture's `.md` mirror routes are pre-existing site content, not
something `astro.js` creates.

---

## Last Session (2026-09-08)

Added `src/fixers/astro.js` — the framework fixer for plain Astro (no
Starlight): `detectStack` now returns `framework: "astro"` for any repo with
an `astro` dependency but no `@astrojs/starlight`, and `enhance.js` dispatches
by framework (`astro-starlight` vs `astro`) instead of hardcoding the
Starlight fixer. Unlike `astro-starlight.js`, this fixer can't generate a
content-aware `llms.txt` or `.md` mirror routes — no `docs` collection or
component-override convention to build on, and guessing at an arbitrary
site's routing produces broken links, which is worse than no fix (same
reasoning as the already-documented "when to use this" stance below). It
covers three things that are safe regardless of content shape: a real
`src/pages/404.astro`, a permissive `public/robots.txt` (with a `Sitemap:`
line only when both `site` and `@astrojs/sitemap` are present in
`astro.config.*`), and — only when the repo already has a hand-rolled
markdown-mirror route (`*.md.ts` under `src/pages` that echoes a collection
entry's `.body`/`entry.body` verbatim) — a new `smartQuotes()` typography
util plus a named warning to wire it into that specific route.

The `smartQuotes()` fix exists because of a real bug found dogfooding a
production Astro (non-Starlight) site this session: Astro runs
`remark-smartypants` by default, curling straight quotes/apostrophes on
*rendered HTML* only — a route serving a collection entry's raw `.body` never
gets that transform, so afdocs' `markdown-content-parity` check flagged
43–49% of quote-heavy blog posts as "missing content" that was actually
present verbatim, just with different quote characters. Confirmed via `curl`
diffing the live `.md` route against the live rendered page. Traced and fixed
by hand in the target repo first, then generalized into this fixer. A
residual, smaller gap remains on posts using Markdown footnotes (`[^1]`
source vs. a bare rendered number with no brackets) — looks like a structural
limit of that specific check, not something worth chasing further.

Detection heuristic for "does this route need the warning" went through one
false-positive round: originally any `*.md.ts` file was flagged, which
incorrectly warned about index/listing routes and a data-driven `about.md.ts`
that don't echo raw body content at all. Fixed by requiring a `.body` (or
`entry.body`) reference in the file before warning — verified against the
real target repo (which has both false-positive-shaped routes and two
genuine `.body`-echoing routes) that this correctly warns on zero files after
the target's own routes were already fixed by hand, and zero routes are
flagged on the listing/about routes.

Tested via a scratch `rsync` copy of a real production Astro+Cloudflare-Pages
site (not a synthetic fixture — none built yet, see Next Actions): `enhance`
correctly detects `astro + cloudflare-pages`, writes `robots.txt` +
`functions/_middleware.js`, skips the already-present `404.astro` and
`smartquotes.ts`, and a second `enhance` run is a clean no-op (everything
skipped, nothing rewritten) — matches CONTRIBUTING.md's testing bar.

Also closed out the long-open Next Actions #3 from v0.4.0: documented in both
README.md ("Design notes") and SKILL.md ("What to tell the user afterward")
that `is-agentic` rescans can return an identical cached result even after a
confirmed-live production deploy, with the concrete instruction to verify via
`curl` before reporting a fix as not-working.

---

## Next Actions

0. **[TOP PRIORITY, decision pending]** `loop`'s Cloudflare Quick Tunnel
   support for hosted scanners (`src/lib/tunnel.js`, wired into `loop.js`)
   tested unreliable this session — 1 success in 4 attempts, DNS resolution
   failures on the `*.trycloudflare.com` hostname. Pick one (see Last
   Session for full detail): (1) add retry-with-a-fresh-tunnel-per-attempt,
   (2) switch to a named/authenticated Cloudflare Tunnel (needs a CF
   account), or (3) roll back to the hard-reject and document the
   limitation. Whichever is chosen, re-verify with a real `loop` run against
   `examples/astro-cf-pages --scanners ora` (or `is-agentic`) before
   considering this done or bumping the version.
1. ~~Build a synthetic `examples/astro-cf-pages/` fixture~~ — done, see Last
   Session.
2. Re-run `enhance` (plain-Astro fixer) against a **fresh** site that has
   none of these fixes yet and confirm the `is-agentic`/`afdocs` score
   actually moves on a real deploy — this session's verification was
   structural (file writes, idempotency) against a site that already had
   most of the content-side fixes applied by hand, not a full before/after
   score delta. Note from this session: `afdocs`' `overall` score is gated
   on `llms.txt` existing (see Last Session) — a "real deploy" check for this
   fixer should look at individual checks (`http-status-codes`,
   `content-negotiation`) moving, not `overall`, since the plain-Astro fixer
   never writes `llms.txt` by design.
3. The "when to use this" `llms.txt` section is **not** a generic fixer
   candidate for either Astro fixer — it requires product-specific prose a
   fixer can't invent. Leave as manual guidance, unless a safe generic
   heuristic turns up.
4. Decide/document a policy for `org-schema-completeness` (`contactPoint`,
   `address`) and `trust-anchors` on doc subdomains that intentionally defer
   identity/legal pages to a separate corporate domain — right now these
   just sit as permanent backlog with no way to mark them N/A.
5. Test the installed skill against another unrelated real website project
   to broaden dogfood coverage.
6. Add fixers for additional frameworks/platforms as demand comes in (see
   CONTRIBUTING.md for the fixer contribution process).
7. ~~Consider expanding scanner coverage beyond afdocs + Vercel Is Agentic.~~ —
   done, see Last Session (Ora scanner). No CI/fixture coverage for it yet
   (same "needs a real deploy" gap as #2, since `loop` can't reach hosted
   scanners at all) — fold into #2's real-deploy verification, or give it its
   own pass once #2 happens.
8. Confirm `ora.js`'s per-check `id`s are stable across the `format=audit`
   schema version the docs mention — the adapter was built off the OpenAPI
   spec + docs prose, not a pinned schema version number the way afdocs/
   is-agentic pin CLI versions, since Ora is API-only with no version to pin
   against. Worth a periodic sanity re-check against `ora.ai/api/openapi.json`
   if `normalize()` ever starts producing unexpected nulls.
9. Confirm `.github/workflows/scanner-version-check.yml` actually fires and
   behaves as intended once merged to `main` — validated the YAML structure
   and the `GITHUB_OUTPUT`/`behind` signal locally, but the scheduled
   trigger, the label auto-creation on first issue, and the dedupe-by-label
   search were never exercised against a real Actions run. Trigger it once
   manually via `workflow_dispatch` after merge and check the result.

---

## Open Issues

- `is-agentic` scan results can be stale (server-side cache, no forced
  refresh available) — see Last Session / Next Actions #3.
- `is-agentic`'s score has shown double-digit swings (68 → 72 → 62) across
  scans of the same unchanged-in-the-interim site (`docs.doverunner.com`),
  concentrated in its API-surface `essential`/`recommended` checks
  (openapi-spec, oauth-support, json-error-responses, etc.) — checks that
  are structurally inapplicable to a docs-only site with no public API.
  Looks like scoring/weighting volatility (possibly LLM-judged) on that
  scanner's end, not something our fixer output caused — the two checks we
  did target (`json-ld`, `agent-friendly-404`) both moved the *right*
  direction across that same window. No action item beyond awareness; can't
  do anything about a third party's scoring stability from our side.

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
