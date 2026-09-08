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

## Status: v0.4 (pre-1.0)

| Piece | Status |
|---|---|
| Scanners | [afdocs](https://agentdocsspec.com/) (doc-heavy sites), [Vercel Is Agentic](https://is-agentic.com/) (any content site) — both CLI-based, no browser automation |
| Fixer | Astro + Starlight + Cloudflare Pages |
| Loop | `scan → enhance → rescan → diff-report`, fully local (no live deployment needed) |
| Other frameworks/platforms | Not yet — additive, by demand (see Contributing) |

**Real numbers:** the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site from
**0/100 (F) → 97/100 (A)** on afdocs — see `examples/astro-starlight-cf-pages/README.md` for how to
reproduce that yourself with no deployment required.

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
- `raw/is-agentic.json`, `raw/afdocs.json` — the unmodified scanner CLI output, for debugging
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
- `scanners/afdocs.js` and `scanners/is-agentic.js` are both instances of the adapter contract
  every future scanner adapter should follow: export a `run*Scan(url, options)` that returns
  `{ normalized, raw }`. `is-agentic`'s `issues[]` only lists non-passing checks (afdocs lists
  every check it ran) — each adapter reconciles that into the same `checks[]`/`summary` shape so
  `report.js` needs no scanner-specific branching.
- Both scanner CLIs are invoked at a **pinned version** (`afdocs@0.20.0`, `is-agentic@1.0.1`), not
  a bare package name — an unpinned `npx` call always fetches whatever's newest, and either CLI is
  young enough that a breaking JSON-schema change upstream could silently break every scan. Bump
  deliberately, re-verify the adapter's `normalize()` against the new output.
- **Every scanner adapter must invoke its CLI through `src/lib/npx-runner.js`**, not its own
  `child_process` call — it resolves npm's `npx-cli.js` relative to the running Node binary
  instead of trusting a PATH-resolved `npx` (which can point at an entirely different Node/npm
  install), and it treats a scanned site's own failing checks (which make the scanner CLI exit
  non-zero) as the expected case, not a tool failure.
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
