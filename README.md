# siteready

Scan a website with multiple agent-readiness scanners, get one unified scorecard, auto-fix the
issues a fixer supports for your framework/platform, then re-scan and get a before/after diff —
all from the CLI, no browser automation, no scanner UI scraping.

Not a new scanner. It's an **orchestration + remediation layer** on top of existing scanners,
because no single scanner covers the whole "can an AI agent actually use this site" standard
(discoverability, machine-readable content, controlled interaction), and none of them auto-fix
anything.

```
1. Scan     — run the site through multiple agent-readiness scanners
2. Report   — normalize results into one scorecard (score, grade, failing/warning checks, evidence)
3. Enhance  — detect the site's framework/host, apply matching fixes as a diff (or a PR), never a silent commit
4. Re-scan  — run the same scanners again, diff against baseline, produce a before/after report
```

## Status: v1.2

| Piece | Status |
|---|---|
| Scanners | [afdocs](https://agentdocsspec.com/) (doc-heavy sites), [Vercel Is Agentic](https://is-agentic.com/) (any content site) — both run by default. [Ora](https://ora.ai/) (the engine behind Is Agentic — its full ranker, 127 checks incl. a payments layer Is Agentic's subset skips) is opt-in (`--scanners ora`), see Design notes. CLI-based or direct public API, no browser automation |
| Fixer | Astro + Starlight + Cloudflare Pages, and plain Astro (no Starlight) + Cloudflare Pages |
| Loop | `scan → enhance → rescan → diff-report`, fully local (no live deployment needed) |
| CI | Windows, macOS, and Linux, on every push — see `.github/workflows/ci.yml` |
| Other frameworks/platforms | Not yet — additive, by demand (see Contributing) |

**Real numbers:** the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site from
**0/100 (F) → 97/100 (A)** on afdocs — see `examples/astro-starlight-cf-pages/README.md` for how to
reproduce that yourself with no deployment required.

The plain-Astro fixer (`src/fixers/astro.js`) is deliberately smaller: without Starlight's `docs`
content collection and component-override system, a fixer can't safely generate a content-aware
`llms.txt` or `.md` mirror routes for an arbitrary Astro site — it would have to guess the site's
own routing/slug conventions, and a wrong guess produces broken links, which is worse than no fix.
It covers what's safe regardless of content shape: a real `404.astro`, a permissive `robots.txt`
(with a `Sitemap:` line if `site` + `@astrojs/sitemap` are both present), and — only if the repo
already has a hand-rolled markdown-mirror route that echoes a collection entry's raw `.body` — a
`smartQuotes()` typography-normalization util plus a named warning to wire it in (see "Design
notes" below for why). Verified against a real production Astro (non-Starlight) + Cloudflare Pages
site: correctly detects the stack, skips everything already present, and a second `enhance` run is
a clean no-op.

## Why use this, instead of pointing an agent at the scanners directly?

Every scanner here already returns a `fix`/`recommendation` string on each failing check — so an
agent with repo access could, in principle, call `afdocs`/`is-agentic`/Ora directly and act on that
text itself, no siteready in the loop. Worth asking honestly where that leaves this tool, because
the answer isn't the same for every layer of it.

**The scan/report layer is genuinely weaker in an agent-native world.** Normalizing three scanners'
different JSON shapes into one scorecard is mostly a *human-readability* win (`report.md`, a diffable
schema) — an agent doesn't care that afdocs and is-agentic disagree on field names; it can just read
both raw outputs and act on each `fix` field. If your only user is an agent, not a person reading a
report, this part of siteready is convenience, not unique capability.

**The fixers are where the real value is, and it isn't close.** A scanner's `fix` field is a
one-line suggestion — "add an llms.txt directive," "serve markdown on `.md` URLs." Turning that into
working code is where the actual difficulty lives, and this project's own history is the evidence:
`fixers/astro.js`'s `smartQuotes()` exists because Astro's default `remark-smartypants` curls quotes
on rendered HTML only, silently failing afdocs' `markdown-content-parity` check on 43–49% of a real
site's blog posts — a plausible-looking hand fix would have missed that entirely. Add the false-positive
`.md.ts`-detection heuristic that had to be corrected once, the CRLF-vs-`\n` fixture-stripping bug
caught by Windows CI, `taskkill /t` for orphaned `wrangler` processes, `is-agentic`'s server-side
caching trap (a confirmed-live fix can rescan as unchanged), and Ora's `url` field being a
report-page link rather than the scanned site (see `scanners/ora.js`). An agent improvising a fix
from a scanner's one-sentence suggestion has to rediscover every one of those the hard way, against
a real site, in production. siteready's fixers are that already-paid-for cost, applied idempotently
(skip what already exists, never overwrite), verified cross-platform in CI.

**The loop is the other asset an ad hoc fix session doesn't have.** `scan → enhance → rescan →
diff-report` proves a fix worked — locally, before anything ships, with no live deployment needed
(`examples/*/README.md` reproduce real before/after numbers this way). An agent applying suggestions
by hand has no equivalent: it has to deploy live and diff two scans itself, and it won't know about
`is-agentic`'s caching trap above unless it's already been burned by it once.

**Where this argument fully favors "just use an agent directly": outside the framework/platform
combos a fixer covers.** Today that's Astro (with or without Starlight) + Cloudflare Pages only —
anything else and `enhance` reports `unsupported`, and siteready really is just a nicer wrapper
around scanner output for that site. That's the honest scope limit, and it's also the roadmap: this
tool's value scales with fixer/platform coverage (see Contributing), not with scanner count — `ora`
was deliberately made opt-in rather than a fourth default scanner for exactly this reason (see
Design notes).

## Usage

```bash
# scan + report (any public URL)
node src/cli.js https://example.com
node src/cli.js https://example.com --out ./out/my-scan --sampling deterministic
node src/cli.js https://example.com --scanners is-agentic

# enhance a local repo checkout (needs the actual repo, not just the URL — see "How enhance works")
node src/cli.js enhance ../my-astro-starlight-site
node src/cli.js enhance ../my-astro-starlight-site --pr   # open a PR instead of leaving an unstaged diff

# rescan + diff vs a baseline report (re-runs the baseline's own scanner set unless overridden)
node src/cli.js rescan https://example.com --baseline ./out/example.com-.../report.json

# diff two already-written reports directly
node src/cli.js diff-report ./out/before/report.json ./out/after/report.json

# full local loop: scan -> enhance -> rescan -> diff-report, no deployment, no manual steps
node src/cli.js loop ../my-astro-starlight-site
```

Output (default `./out/<hostname-or-dir>-<timestamp>/`):
- `report.md` — human-readable scorecard per scanner (overall score, category breakdown, failing/warning checks with fix hints)
- `report.json` — normalized, machine-readable version of the same data
- `raw/is-agentic.json`, `raw/afdocs.json`, `raw/ora.json` — the unmodified scanner output, for debugging
- `diff-report.md` / `diff-report.json` (from `rescan`, `diff-report`, or `loop`) — before/after
  score deltas plus per-check "Fixed" / "Regressed" / "Still failing" breakdowns

`enhance` prints what it wrote/skipped/warned about and exits — without `--pr` it produces an
unstaged diff in the target repo for you to review, never a commit.

## How `enhance` works

`scan`/`rescan`/`diff-report` only ever need a public URL. `enhance` is architecturally different:
its fixes are source-file edits (an `llms.txt` endpoint, a layout override, a platform config file),
so it needs a **local checkout of the target site's own repo**, not just its URL — there's no way to
write "add a `src/pages/llms.txt.ts` file" against a URL alone. This is naturally satisfied when you
run it from inside your own project directory.

`enhance` never commits or pushes on its own — it writes to the working tree and either opens a PR
(`--pr`, requires a git remote + an authenticated `gh`) or leaves an unstaged diff for you to
review. It also never overwrites a file the target already has (e.g. an existing
`functions/_middleware.js`) — it skips it and tells you.

## Architecture

```
siteready/
├── src/
│   ├── cli.js              # entry point: scan / enhance / rescan / diff-report / loop
│   ├── scan.js              # runs configured scanner adapters -> normalized report (shared by scan & rescan)
│   ├── report.js            # normalized report -> report.md / report.json
│   ├── diff-report.js       # baseline vs re-scan -> diff-report.md / diff-report.json
│   ├── detect-stack.js      # framework/host fingerprinting from the LOCAL repo (package.json, config files)
│   ├── enhance.js           # detects stack, applies the matching fixer + platform module
│   ├── pr.js                # opt-in enhance --pr flow (branch, commit, push, gh pr create)
│   ├── loop.js               # local scan -> enhance -> rescan -> diff-report orchestration
│   ├── scanners/            # pluggable scanner adapters — export run*Scan(url, options) -> { normalized, raw }
│   ├── fixers/               # pluggable, framework-scoped remediation
│   ├── platforms/            # deployment-target adapters (negotiation/headers)
│   └── lib/
│       ├── npx-runner.js     # cross-platform npx invocation (see "Cross-platform notes")
│       └── local-server.js   # build + serve a repo locally for `loop` (no live deployment)
└── examples/
    └── astro-starlight-cf-pages/   # reference fixture the fixer is developed and verified against
```

Every scanner adapter and every fixer is independently pluggable — a scanner going offline or a
framework having no fixer yet degrades to "unsupported," never breaks the pipeline.

## Design notes

- The normalized schema (`{ target, generatedAt, scanners: { <name>: {...} } }`) holds multiple
  scanners side by side without a rewrite — adding a new scanner is a new entry under `scanners`,
  no changes to the ones already there.
- `scanners/afdocs.js`, `scanners/is-agentic.js`, and `scanners/ora.js` are all instances of the
  adapter contract every future scanner adapter should follow: export a `run*Scan(url, options)`
  that returns `{ normalized, raw }`. `is-agentic`'s `issues[]` only lists non-passing checks
  (afdocs and Ora list every check they ran) — each adapter reconciles that into the same
  `checks[]`/`summary` shape so `report.js` needs no scanner-specific branching.
- Both scanner CLIs are invoked at a **pinned version** (`afdocs@0.20.0`, `is-agentic@1.0.1`), not
  a bare package name — an unpinned `npx` call always fetches whatever's newest, and either CLI is
  young enough that a breaking JSON-schema change upstream could silently break every scan. Bump
  deliberately, re-verify the adapter's `normalize()` against the new output.
- **Staying current without floating the pin.** Agent-readiness scanning is a new-enough category
  that these engines update often, so two things soften the pin above without weakening it:
  `npm run check-scanner-versions` diffs the pinned versions against npm's latest and tells you
  when a bump is due (doesn't change anything itself); `AFDOCS_VERSION=x.y.z` /
  `IS_AGENTIC_VERSION=x.y.z` env vars override the version for one run, so you can try a newer
  release ahead of a deliberate bump without editing source. `.github/workflows/scanner-version-check.yml`
  runs the check weekly and files/updates a `scanner-version-drift`-labeled issue when a pin falls
  behind — it never bumps the pin itself, same "re-verify `normalize()` first" rule applies.
  `ora.js` needs neither — it's a
  direct API call with no version to pin, so it's always on Ora's latest engine automatically.
- **Every scanner adapter must invoke its CLI through `src/lib/npx-runner.js`**, not its own
  `child_process` call — it resolves npm's `npx-cli.js` relative to the running Node binary
  instead of trusting a PATH-resolved `npx` (which can point at an entirely different Node/npm
  install), and it treats a scanned site's own failing checks (which make the scanner CLI exit
  non-zero) as the expected case, not a tool failure.
- `scanners/ora.js` is the one exception to the npx-runner rule above: Ora
  (https://ora.ai/, the engine Vercel's Is Agentic wraps with a simplified `include=essentials`
  subset) has no CLI, only a public, keyless-for-reads API, so the adapter calls `fetch()`
  directly against `POST https://ora.ai/api/scan?format=audit`. Rate-limited (10/min burst,
  30/day, 6 force-scans/day) — the adapter defaults `force: false` so repeated scans of the same
  URL lean on Ora's own 6-hour cache instead of burning quota.
- **`ora` is opt-in, not in `DEFAULT_SCANNERS`.** `is-agentic`'s score is computed from the same
  Ora API with `include=essentials` — it's a strict subset of `ora`'s full ranker, not an
  independent measurement. Until a fixer targets some `ora`-specific check (ARD catalog, A2A agent
  card, etc. — none of which the current fixers touch), running both by default would just double
  the hosted-API cost for overlapping data. Pass `--scanners ora` explicitly to use it. If a fixer
  for `ora`-specific checks ever ships, revisit retiring `is-agentic.js` in favor of `ora.js`
  requesting `include=essentials` in the same call.
- `detect-stack.js` + `enhance.js` + `fixers/*.js` + `platforms/*.js` split cleanly along a
  framework/platform axis: a fixer is framework-only (llms.txt, `.md` mirrors, a body-level
  directive), a platform module is platform-only (content-negotiation headers/Functions), and
  `enhance.js` just detects the pair and calls both. Adding a second framework or platform later is
  additive — new files, no changes to the pair already shipped.
- `scan.js` is the one place both `scan` and `rescan` call into — `rescan` isn't a separate
  scanning implementation, just the same `scanTarget()` plus a diff against a baseline.
- `diff-report.js` diffs two normalized reports check-by-check (`fixed` / `regressed` /
  `stillFailing` / `newChecks` / `removedChecks`), not just score-by-score, so `diff-report.md`
  reads as a real before/after — which checks got fixed, which regressed, what's still backlog.
- `lib/local-server.js` builds a repo (`npm install` + `npm run build`) and serves the output
  locally (`wrangler pages dev` for Cloudflare Pages, via a long-running process spawned through
  `lib/npx-runner.js`) so `loop` can scan a fixer's target with **no live deployment**. Windows
  needs `taskkill /t` to kill the whole process tree (`child.kill()` alone leaves wrangler's own
  child process running); POSIX uses a detached process group + `process.kill(-pid)`.
- `pr.js` is the opt-in `--pr` flow for `enhance` — it degrades to "left as an unstaged diff"
  (never throws) if there's no git remote or `gh` isn't authenticated, so a user without those
  configured still gets the default behavior.
- **`is-agentic` rescans can lag a real production change with no way to force a fresh crawl.**
  It's a hosted third-party scanner (`npx is-agentic@1.0.1`) that caches results per domain
  server-side; `rescan` calling it twice — once right after a fix ships, once after the deploy is
  confirmed live via `curl` — can return the *identical* cached result both times (same
  `scanned_at`). `afdocs`, by contrast, re-crawls live on every call. If `rescan`/`loop` shows zero
  movement on `is-agentic` for a check you know you fixed, verify the live site directly (`curl` the
  page, grep for the expected content) before concluding the fix didn't work — then, if it's
  confirmed live, either wait out the cache or manually trigger a rescan on is-agentic.com's own
  page. Its score has also shown double-digit swings scan-to-scan on an unchanged site — treat it as
  noisier/less deterministic than afdocs, especially near category boundaries. `ora.js` hits the
  same underlying engine but its API does expose a `force` param to bypass the cache — `runOraScan`
  just doesn't default to it, to conserve the 6/day force-scan quota.
- **A hand-rolled markdown-mirror route (`.md.ts` serving `entry.body`/`doc.body` verbatim) will
  fail afdocs' `markdown-content-parity` check on any Astro site using the default markdown
  pipeline**, even when the served markdown is byte-for-byte the page's real source. Astro runs
  `remark-smartypants` by default, curling straight quotes/apostrophes (`"`/`'` → `“”`/`’`) and
  collapsing `...` → `…` on the *rendered HTML* only — the raw collection body a `.md.ts` route
  echoes back keeps the straight characters, so a parity checker diffing rendered text against raw
  markdown sees every quote-bearing paragraph as "missing" (seen at 43–49% missing on real
  quote-heavy blog posts). Root cause, not the route's content actually being stale — fix is
  typographic normalization on the served body (see `fixers/astro.js`'s `smartQuotes()`), not
  regenerating content. A residual, much smaller gap can remain on posts using Markdown footnotes
  (`[^1]`): the parity checker extracts rendered footnote references as a bare visible number (no
  brackets), which will never text-match the raw `[^1]:` source syntax — this looks like a
  structural limit of that specific check rather than something a fixer can close further.

## Cross-platform notes

Runs on Windows, macOS, and Linux — this is CLI-driven (npx-based scanners, file-editing fixers),
so "does it run on the user's machine" is a real correctness bar, not a nice-to-have. Two
platform-layout bugs already caught building this, both fixed in shared helpers so no individual
scanner/fixer needs its own OS branching:

- **`npx` resolution**: Windows (`<root>/node.exe`, `<root>/node_modules/npm/...`), POSIX
  tarball/nvm/fnm (`<root>/bin/node`, `<root>/lib/node_modules/npm/...`), and Homebrew
  (`/usr/local/bin/node` symlinked into a versioned Cellar path) all lay out npm differently.
  `lib/npx-runner.js` tries all three known layouts (existence-checked, first match wins,
  `fs.realpathSync` first to see through Homebrew's symlink) and only falls back to a
  PATH-resolved `npx`/`npx.cmd` if none match.
- **`.cmd` shims**: `child_process.spawn('npm.cmd', args)` fails with `EINVAL` on Windows unless
  `shell: true` is set — plain executables don't need this, but anything invoked through npm's
  Windows batch-file shims does. `lib/local-server.js` sets it conditionally on `win32`.

**Node version note:** siteready itself only needs Node ≥18, but `examples/astro-starlight-cf-pages`
pins a floating Astro range that currently requires **Node ≥22.12** to build — CI runs on Node 22
for exactly this reason. If `loop`/`verify-loop.js` fails with "Node.js vX is not supported by
Astro," that's the fixture's own dependency, not siteready — upgrade Node, don't downgrade Astro's
declared range.

## Contributing

Adding a scanner adapter or a framework fixer is additive — new files under `scanners/` or
`fixers/`+`platforms/`, no changes to what's already shipped. See `CONTRIBUTING.md` for the
interface contract.

## License

MIT — see `LICENSE`.
