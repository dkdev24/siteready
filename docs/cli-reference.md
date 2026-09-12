---
title: CLI Reference
---

[← Back to index](index)

# CLI Reference

```bash
# scan + report (any public URL)
siteready https://example.com
siteready https://example.com --out ./out/my-scan --sampling deterministic
siteready https://example.com --scanners is-agentic
siteready https://example.com --site-type content   # exclude API-surface checks from the score

# enhance a local repo checkout (needs the actual repo, not just the URL — see "How enhance works")
siteready enhance ../my-astro-starlight-site
siteready enhance ../my-astro-starlight-site --pr   # open a PR instead of leaving an unstaged diff

# rescan + diff vs a baseline report (re-runs the baseline's own scanner set unless overridden)
siteready rescan https://example.com --baseline ./out/example.com-.../report.json

# diff two already-written reports directly
siteready diff-report ./out/before/report.json ./out/after/report.json

# one local scan against a repo checkout, no public URL — for a site not deployed yet
siteready scan-local ../my-astro-starlight-site

# local re-scan + diff vs a baseline report, against a repo checkout — run after enhance,
# as a separate step (not scripted back-to-back with scan-local) so a real gap falls between
# their two Cloudflare Quick Tunnels if hosted scanners are in use
siteready rescan-local ../my-astro-starlight-site --baseline ./out/my-astro-starlight-site-local-.../report.json

# scan multiple sites and render them side by side
siteready compare https://example.com https://a-competitor.com

# score-over-time from past scan/rescan runs under ./out (no new scanning)
siteready monitor https://example.com

# install this package's own SKILL.md for an agent tool (see "How install-skill works")
siteready install-skill claude codex opencode
```

Run `siteready --help` for the full, always-current flag list (`--scanners`, `--sampling`,
`--site-type`, `--port`, `--out`, and the scanner-version override env vars) — this page covers the
commands, not every flag.

## Output

Default location: `./out/<hostname-or-dir>-<timestamp>/`

| File | Contents |
|---|---|
| `report.md` | Human-readable scorecard per scanner — overall score, category breakdown, failing/warning checks with fix hints |
| `report.json` | Normalized, machine-readable version of the same data |
| `raw/is-agentic.json`, `raw/afdocs.json`, `raw/ora.json` | Unmodified scanner output, for debugging |
| `diff-report.md` / `diff-report.json` | From `rescan`, `rescan-local`, or `diff-report` — before/after score deltas plus per-check Fixed / Regressed / Still-failing breakdowns |
| `compare-report.md` / `compare-report.json` | From `compare` — every target's score side by side per scanner, plus each site's own full report under `<out>/<hostname>/` |
| `monitor-report.md` / `monitor-report.json` | From `monitor` — a score-over-time table across every past scan for a hostname, plus regressions flagged between consecutive scans |

`enhance` prints what it wrote/skipped/warned about and exits — without `--pr` it produces an
unstaged diff in the target repo for you to review, never a commit.

## How `enhance` works

`scan`/`rescan`/`diff-report` only ever need a public URL. `enhance` is architecturally different:
its fixes are source-file edits (an `llms.txt` endpoint, a layout override, a platform config
file), so it needs a **local checkout of the target site's own repo**, not just its URL — there's
no way to write "add a `src/pages/llms.txt.ts` file" against a URL alone. This is naturally
satisfied when you run it from inside your own project directory.

`enhance` never commits or pushes on its own — it writes to the working tree and either opens a PR
(`--pr`, requires a git remote + an authenticated `gh`) or leaves an unstaged diff for you to
review. It also never overwrites a file the target already has (e.g. an existing
`functions/_middleware.js`) — it skips it and tells you.

## How `install-skill` works

`SKILL.md` at the package root tells an agent *when* and *how* to run siteready commands — it's the
same file whether a human reads it or an agent loads it as a skill. `install-skill <agent...>`
copies it into whichever path that agent tool discovers skills from:

| Agent | Path (project / `--global`) |
|---|---|
| `claude` | `.claude/skills/siteready/SKILL.md` / `~/.claude/skills/siteready/SKILL.md` |
| `codex`, `opencode` | `.agents/skills/siteready/SKILL.md` / `~/.agents/skills/siteready/SKILL.md` |

`codex` and `opencode` write to the same path — both discover skills there — so installing one
installs both. The `claude` copy is written byte-for-byte: Claude Code tells the agent its own
skill's base directory at load time, so the `<skill-dir>` placeholder inside `SKILL.md` is left for
Claude to resolve itself. Codex and OpenCode don't document an equivalent signal, so their copy has
`<skill-dir>` replaced with this installation's real absolute path at install time instead.

By default it skips a path that's already installed (pass `--force` to overwrite); `--uninstall`
removes it instead of writing it. Running via `npx` prints a warning, since the resolved path
codex/opencode install into wouldn't survive that npx cache being evicted — install
`siteready` with `npm install -g` (or as a project dependency) first for a stable path.
