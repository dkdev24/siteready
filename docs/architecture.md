---
title: Architecture
---

[← Back to index](index)

# Architecture

```
siteready/
├── src/
│   ├── cli.js              # entry point: scan / enhance / rescan / diff-report / scan-local / rescan-local / loop
│   ├── scan.js              # runs configured scanner adapters -> normalized report (shared by scan & rescan)
│   ├── report.js            # normalized report -> report.md / report.json
│   ├── diff-report.js       # baseline vs re-scan -> diff-report.md / diff-report.json
│   ├── detect-stack.js      # framework/host fingerprinting from the LOCAL repo (package.json, config files)
│   ├── enhance.js           # detects stack, applies the matching fixer + platform module
│   ├── pr.js                # opt-in enhance --pr flow (branch, commit, push, gh pr create)
│   ├── loop.js               # local scan orchestration (scan-local / rescan-local / loop)
│   ├── skill-install.js      # install-skill orchestration: resolves package root, dispatches to installers/
│   ├── scanners/            # pluggable scanner adapters — export run*Scan(url, options) -> { normalized, raw }
│   ├── fixers/               # pluggable, framework-scoped remediation
│   ├── platforms/            # deployment-target adapters (negotiation/headers)
│   ├── installers/           # pluggable per-agent SKILL.md installers (claude, agents-skill for codex/opencode)
│   └── lib/
│       ├── npx-runner.js     # cross-platform npx invocation (see Cross-platform notes below)
│       └── local-server.js   # build + serve a repo locally for `scan-local`/`rescan-local` (no live deployment)
└── fixtures/
    ├── astro-starlight-cf-pages/   # reference fixture the Astro+Starlight fixer is verified against
    ├── astro-cf-pages/             # reference fixture the plain-Astro fixer is verified against
    └── nextjs-vercel/              # reference fixture the Next.js+Vercel fixer is verified against
```

Every scanner adapter and every fixer is independently pluggable — a scanner going offline or a
framework having no fixer yet degrades to "unsupported," never breaks the pipeline.

## Design notes

- **Agent skill installers** (`install-skill`, `src/skill-install.js` + `src/installers/`). The
  package ships `SKILL.md` at its root either way; `install-skill` just copies it to wherever a
  given agent tool discovers skills from — no separate content to maintain per agent. Claude Code
  gets a byte-for-byte copy at `.claude/skills/siteready/SKILL.md`, since it tells the agent its own
  skill's base directory at load time and `SKILL.md`'s `<skill-dir>` placeholder is written for the
  agent to resolve that way. Codex CLI and OpenCode both discover skills at the same
  `.agents/skills/siteready/SKILL.md` path but don't document an equivalent runtime signal, so their
  shared installer (`installers/agents-skill.js`) bakes `<skill-dir>` into a real absolute path at
  install time instead — installing one of `codex`/`opencode` installs the other for free. Cursor,
  Windsurf, and Aider have no comparable skill-discovery directory (flat single rules files, no
  per-tool namespace) and aren't wired up yet — see `CONTRIBUTING.md` for the installer contract to
  add one.
- **Site-type filtering** (`--site-type content|api|application|auto`, default `auto`/unfiltered).
  `is-agentic`/Ora score a site against ~184 checks spanning discovery, access, usability, and
  payments — a chunk of the usability/payments checks (`openapi-spec`, `oauth-support`, the whole
  Payments layer, etc.) only make sense if the site exposes a public API, and drag down a pure
  content/docs site's grade for something it was never going to have. `--site-type content` excludes
  those from scoring; `api`/`application` currently score everything, same as `auto` — the ask this
  solved (see `ISSUES.md`'s `is-agentic` volatility entry) was keeping API checks off a content
  site's grade, not the reverse. `src/site-types.js` holds the id→applicability map, sourced from
  Ora's live `/api/checks` catalog — deliberately a conservative subset (Payments layer + the
  API-transport checks the volatility report named), not a full classification of every check, since
  most of the rest (MCP, GraphQL, accessibility, discovery) are either broadly applicable or need
  product judgment this tool has no authority to guess. Score is only recomputed net of the excluded
  checks for scanners that report per-check point weights (afdocs, Ora); `is-agentic` never exposes
  those (its `checks[]` only lists non-passing issues with no per-check weight), so its own score is
  left as reported — excluded checks are still listed under "Not applicable for this site type" for
  visibility, with a note that the score above isn't adjusted. `report.json` records which
  `siteType` was used; `rescan` defaults to the baseline's own site type, and `diff-report`/`rescan`
  warn if baseline and re-scan end up on different types instead of silently misreading the delta.
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
  `ora.js` needs neither — it's a direct API call with no version to pin, so it's always on Ora's
  latest engine automatically.
- **Every scanner adapter must invoke its CLI through `src/lib/npx-runner.js`**, not its own
  `child_process` call — it resolves npm's `npx-cli.js` relative to the running Node binary
  instead of trusting a PATH-resolved `npx` (which can point at an entirely different Node/npm
  install), and it treats a scanned site's own failing checks (which make the scanner CLI exit
  non-zero) as the expected case, not a tool failure.
- `scanners/ora.js` is the one exception to the npx-runner rule above: Ora
  (https://ora.ai/, the engine Vercel's Is Agentic wraps with a simplified `include=essentials`
  subset) has no CLI, only a public, keyless-for-reads API, so the adapter calls `fetch()`
  directly against `POST https://ora.ai/api/scan?format=audit`. **Rate-limited per IP** — 10
  scans/minute burst, 30 per rolling 24h, of which 6 may be force (cache-bypassing) scans
  ([ora.ai/docs](https://ora.ai/docs)). Cache hits don't consume quota, so the adapter defaults
  `force: false` and repeated scans of the same URL lean on Ora's own 6-hour freshness window
  instead of burning quota; a burst of *distinct* URLs is what actually exhausts it. Over the
  limit, Ora returns HTTP 429 with a `Retry-After` header — the adapter turns that into an error
  naming the quotas and the wait, so it reads as "come back later," not "the scan is broken."
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
  locally — `wrangler pages dev` for Cloudflare Pages (via a long-running process spawned through
  `lib/npx-runner.js`), or `npm run start` (`next start`) for Vercel/Next.js, which is also what
  runs Proxy/Middleware locally (a static export doesn't) — so `scan-local`/`rescan-local` can scan
  a fixer's target with **no live deployment**. Windows needs `taskkill /t` to kill the whole process tree
  (`child.kill()` alone leaves the child process running); POSIX uses a detached process group +
  `process.kill(-pid)`. Every other platform (Netlify, GitLab Pages, and any future static host)
  falls back to a generic in-process `node:http` static file server over the build output —
  no bespoke CLI, no npx download, no account, since serving a static directory needs no
  platform-specific tooling. `runScanLocal`'s only hard exclusion is Jekyll, by framework rather
  than platform: its build is Ruby/bundler, not `npm run build`, so `ensureInstalled`/`buildSite`
  don't apply regardless of which Pages host it targets — every other platform value
  `detect-stack.js` can return rides one of the two paths above automatically, with no allowlist
  to keep extending. The generic static-file fallback has a real ceiling: it serves file content
  only, so a platform's edge runtime (Netlify's Edge Functions, for its markdown-negotiation fix)
  never actually runs — a local scan reads that check as failing even after `enhance`, and only a
  public scan against the real deployed URL shows it fixed. `loop.js`'s `localScanCaveatFor` names
  this whenever the detected platform isn't in `local-server.js`'s `PLATFORMS_WITH_EDGE_RUNTIME`
  (Cloudflare Pages, Vercel), surfaced in CLI output and as `report.localScanNote` — see ISSUES.md.
- `lib/tunnel.js` extends that to the **hosted** scanners. `afdocs` fetches the scanned URL from
  this machine, so `localhost` is fine for it; `is-agentic` and `ora` run their own crawler on
  someone else's infrastructure and can never reach `localhost`. Requesting either from
  `scan-local`/`rescan-local`/`loop` opens an ephemeral Cloudflare Quick Tunnel (`cloudflared tunnel
  --url`, no account or signup) to the local preview server, so those commands work against every
  scanner with no deployment. `loop` opens two, back-to-back in one process (baseline scan, then
  re-scan) — reliable since the precheck fix below, which is what let `loop` come back after being
  removed over a (disproven) theory that two tunnels that close together were unsafe. The site is briefly reachable by anyone holding the random URL and is torn
  down right after the scan — same risk class as a preview deployment, shorter-lived. Quick Tunnels
  are anonymous and best-effort; any failure (`cloudflared` exiting, or the hostname not becoming
  reachable in time) is retried as a whole fresh tunnel (3 attempts; override with
  `SITEREADY_TUNNEL_ATTEMPTS`). Before probing a freshly-minted hostname at all, `startTunnel` waits
  for `cloudflared`'s own "precheck complete hard_fail=false" log line — probing before that line
  appears was the actual cause of early DNS-reachability failures (WORKLOG.md 2026-09-12 "#19
  resolved"), not propagation speed or spacing between tunnel creations, both of which were tried
  and reverted first. `startTunnel` also warns once usage nears the empirically-observed (also
  undocumented) ~20/hour creation rate limit, but no longer refuses or delays a new tunnel itself.
- `pr.js` is the opt-in `--pr` flow for `enhance` — it degrades to "left as an unstaged diff"
  (never throws) if there's no git remote or `gh` isn't authenticated, so a user without those
  configured still gets the default behavior.
- **`is-agentic` rescans can lag a real production change with no way to force a fresh crawl.**
  It's a hosted third-party scanner (`npx is-agentic@1.0.1`) that caches results per domain
  server-side; `rescan` calling it twice — once right after a fix ships, once after the deploy is
  confirmed live via `curl` — can return the *identical* cached result both times (same
  `scanned_at`). `afdocs`, by contrast, re-crawls live on every call. If `rescan`/`rescan-local` shows
  zero movement on `is-agentic` for a check you know you fixed, verify the live site directly (`curl` the
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

**Node version note:** siteready itself only needs Node ≥18, but `fixtures/astro-starlight-cf-pages`
pins a floating Astro range that currently requires **Node ≥22.12** to build, and `next@16` (used
by `fixtures/nextjs-vercel`) requires **Node ≥20.9** — CI runs on Node 22 to satisfy both. If
`scan-local`/`verify-loop.js` fails with "Node.js vX is not supported by Astro" (or an equivalent
Next.js engine error), that's a fixture's own dependency, not siteready — upgrade Node, don't
downgrade the fixture's declared range.
