# siteready — original design plan (historical, frozen)

> **This document is frozen and is not maintained.** It's the original design/planning doc that
> seeded the project, kept because the *reasoning* behind several still-load-bearing decisions
> lives here and nowhere else (why CLI-first over UI scraping, why the framework/platform axes are
> split, why `enhance` never commits). It is **not** a source of truth for current state.
>
> For anything current, read instead:
>
> | Question | Doc |
> |---|---|
> | What state is the project in? | `HANDOFF.md` |
> | What's next / open TODOs? | `NEXT_ACTIONS.md` |
> | Known open issues | `ISSUES.md` |
> | What happened, when, and why | `WORKLOG.md` |
> | How it works / architecture / design notes | `README.md` |
> | Rules for editing siteready itself | `AGENTS.md` |
>
> Frozen as of v1.3.1 (2026-09-09). §13 below lists the specific places this plan is now known to
> be wrong, so a reader doesn't have to diff it against the code to find out.

---

## 0. Provenance

siteready began as a spin-off of an internal agent-readiness assessment project, generalized from
a single-site fix into a framework-agnostic public tool. The origin case study was a real Astro +
Starlight documentation site (originally on Vercel, later Cloudflare Pages) taken from **0/100 (F)
to 99/100 (A)** on afdocs — the numbers that motivated the whole project and that
`examples/astro-starlight-cf-pages/` now reproduces synthetically, with no dependency on the
original site.

All internal, employer-specific material — the original site's identity, internal planning and
report documents, KPI/objective references, and internal wiki links — is deliberately **not** part
of this repo. Only the methodology and the code generalized, and only those were carried over.

## 1. What it is

A tool that runs a closed loop on any website or doc site:

1. **Scan** — run the site through multiple agent-readiness scanners.
2. **Report** — normalize results into one baseline scorecard (score, grade, failing/warn checks, evidence).
3. **Enhance** — detect the site's framework/host and apply the matching fixes (as a diff/PR, never a silent commit).
4. **Re-scan** — run the same scanners again, diff against baseline, produce a before/after report.

Not a new scanner. It's an **orchestration + remediation layer** on top of existing scanners,
because no single scanner covers the whole standard (discoverability, governance, controlled
interaction), and none of them auto-fix anything.

> **Corrected 2026-09-09:** this section originally described the project as "a Claude Code
> **skill**." That framing was wrong and has been retired. siteready is a **runnable CLI tool**
> with two equal front doors onto one engine — humans use the `siteready` binary, agents read
> `SKILL.md`, which is a thin adapter containing no logic of its own. See README's "What this is: a
> tool, not a skill" and the standing rule at the top of `AGENTS.md`.

**Input requirements differ by step.** Steps 1/2/4 (scan, report, re-scan) only ever need a public
URL — the scanners hit the live site over HTTP, nothing local required. Step 3 (enhance) is
architecturally different: the fixes are source-file edits (an `llms.txt` endpoint, a layout
override, a platform config file), so **enhance requires local filesystem access to the target
site's own repo**, not just its URL. There's no way to write "add a `src/pages/llms.txt.ts` file"
against a URL alone. So: **scan/report/re-scan work on any site you don't control the code for;
enhance only works on a site whose repo you have checked out.**

**Scanner priority.** CLI-based scanners come first because they're scriptable, ToS-safe, and
rate-limit-free — that's the whole reason this can be a CLI-driven tool instead of a
browser-automation one. Web-only scanners are demoted to manual/optional; see §5.

## 2. Why this is worth open-sourcing

- Every scanner in this space (afdocs, Vercel Is Agentic, Fern Agent Score, Cloudflare
  isitagentready, Glippy) tells you what's wrong. None of them touch your repo. The original fix
  took real engineering judgment — this project encodes that judgment as reusable,
  framework-detected patches instead of one-off consulting.
- The case study is a strong, provable demo: real before/after scores, real diffs, zero new npm
  dependencies. That's rare for an agent-readiness tool and worth leading with.
- "Agent readiness" tooling is early and fragmented (11+ competing standards). A neutral,
  multi-scanner aggregator has a natural reason to exist independent of any one vendor's scanner.

## 3. Scope boundary

Everything specific to the origin project stays private: internal objective/KPI references, wiki
links, internal scenario files, and the original site's own doc source. The case study appears here
only as a **sanitized, generic example** (framework + before/after scores + the class of fix), never
as a walkthrough of a real internal repo.

> **Status 2026-09-09:** this boundary was enforced across the README, the example fixture, and code
> comments at the v1.0 cut — but *this file* was missed, because at the time it still lived in the
> private repo and only moved later. It carried the origin site's hostname, internal document
> names, and objective/KPI references into a public repo. Sanitized on 2026-09-09; see
> `NEXT_ACTIONS.md` for the git-history question this leaves open.

## 4. Architecture (as originally planned)

```
siteready/
├── SKILL.md                     # agent entry point, orchestration instructions
├── scripts/
│   ├── scan.ts                  # runs all configured scanner adapters, writes raw results
│   ├── report.ts                # normalizes raw results -> unified scorecard (JSON + MD)
│   ├── detect-stack.ts          # framework/host fingerprinting FROM THE LOCAL REPO
│   ├── enhance.ts               # applies matched fixers, produces a git diff / PR
│   └── diff-report.ts           # baseline vs re-scan -> before/after MD report
├── scanners/                    # pluggable scanner adapters (see §5) — Tier 1 (CLI) first
├── fixers/                      # pluggable, framework-scoped remediation (see §6)
├── platforms/                   # deployment-target adapters for negotiation/headers (see §6)
├── references/
│   ├── standards.md             # llms.txt, AFDocs spec, Content-Signal, RFC 9727, MCP server cards
│   └── check-catalog.md         # every check, which scanner(s) report it, which fixer resolves it
└── examples/
    └── astro-starlight-cf-pages/ # the proven, sanitized reference fixture (v1 target stack)
```

> **Superseded.** The shipped layout differs: JavaScript (ESM), not TypeScript; everything lives
> under `src/` with a single `src/cli.js` entry point rather than a `scripts/` directory of separate
> entry points; `src/loop.js` and `src/lib/` (`npx-runner.js`, `local-server.js`, `tunnel.js`) were
> never in this plan; and `references/standards.md` / `references/check-catalog.md` were never
> written — the design notes in `README.md` absorbed that role. See `README.md` "Architecture" and
> `AGENTS.md` "Key Paths" for the real thing.

The one part of this section that held completely: **each scanner adapter and each fixer is
independently pluggable — a scanner going offline or a framework having no fixer yet must degrade
to "unsupported," never break the pipeline.** That's still a standing rule (`AGENTS.md`).

## 5. Scanner adapters (pluggable, degrade gracefully)

Two tiers: **CLI scanners** (in MVP, always run) and **web-only scanners** (out of MVP,
manual/optional).

### Tier 1 — CLI scanners (v1 MVP)

| Scanner | Type | Integration | Role |
|---|---|---|---|
| **Vercel Is Agentic** (`npx is-agentic <url> --json`) | CLI, general-purpose site scanner | Direct CLI wrap, JSON output (`{ score, score_breakdown: {essential, recommended, bonus}, issues: [...] }`) | **Primary scanner.** Checks apply to *any* content site — OpenAPI spec, JSON-LD, JSON error responses, agent-friendly 404s — not just doc sites. |
| **afdocs** (`npx afdocs check`) | CLI, open spec (agentdocsspec.com) | Direct CLI wrap, JSON output. | **Supplementary scanner**, run in addition to Is Agentic when the target is document-heavy. Adds doc-specific checks (llms.txt, markdown mirrors, content negotiation, page-size/parity) Is Agentic doesn't cover. |

Both are npx-based: no browser automation, no confirmed ToS friction, no rate limits observed.

> **Updated since.** A third scanner shipped — **Ora** (`src/scanners/ora.js`), the engine Is
> Agentic itself wraps, reached via a keyless-for-reads public API rather than a CLI. It's
> deliberately **opt-in** (`--scanners ora`), not a default, because Is Agentic's score is the same
> Ora ranker with `include=essentials` — a strict subset, not an independent measurement. Also
> revised: both CLI scanners are invoked at **pinned exact versions** rather than a bare `npx`, with
> drift-checking tooling and a weekly GitHub Action around that pin. See README "Design notes."

### Tier 2 — web-only scanners (post-MVP, manual/optional, not auto-run)

| Scanner | Status | Notes |
|---|---|---|
| **Cloudflare isitagentready.com** | Optional, manual | Web app only, no confirmed public API. 4-dimension score (discoverability, content, bot control, protocol). Not orchestrated by this tool. |
| **Fern Agent Score** | **Dropped from the roadmap** | Same underlying logic as afdocs — both implement the AFDocs standard. Running both would double-report the same checks under two labels. afdocs is kept because it has a real CLI; Fern's is a web app. |
| **Glippy** | Deferred, not MVP | Has an MCP server — the cleanest non-CLI integration path if/when wanted. Revisit post-v1 only if a real coverage gap appears. |

**Design rule (still standing): never scrape a scanner UI as a first resort.** Prefer CLI/API/MCP.
If a scanner has no CLI/API, it stays manual/optional rather than being automated via headless
browser.

## 6. Fixers (framework + platform matrix)

**Precondition: a local checkout of the target site's repo** (see §1). Every fix below is a
source-file edit, so stack detection reads `package.json`, framework config, and platform config
(`vercel.json`, `_headers`, `wrangler.toml`, `netlify.toml`, …) **from the local filesystem**, not
from the live site. In scope: platform behavior expressible as a repo-committed config file. Out of
scope, flagged as manual backlog rather than attempted: platform settings that exist only in a
dashboard/API (some CDN cache/WAF rules) — fixing those would need platform API credentials, a
materially bigger trust/security surface this project isn't taking on (§10).

The fix set generalizes into two orthogonal axes — **framework** (what generates the site) and
**platform** (what serves it, i.e. where negotiation/headers get configured):

| Fix | Framework hook | Platform hook |
|---|---|---|
| `llms.txt` generation | Framework-native content collection API | — |
| `.md` mirror routes | Framework routing (custom endpoint per framework) | — |
| Body-level llms.txt directive | Framework layout/theme override | — |
| Content-Signal / AI robots.txt rules | Framework's robots.txt generator | — |
| `Accept: text/markdown` negotiation | — | **Cloudflare Pages (v1 priority)**, Vercel rewrites/headers, Netlify `_redirects`/`_headers`, Nginx `map`/`try_files` |
| Sitemap freshness | Framework sitemap integration | — |
| `Last-Modified` headers | — | Platform config |

v1 ships **Astro + Starlight + Cloudflare Pages**. Each additional framework/platform pair after
that is an additive, isolated module — never a rewrite of the core pipeline.

Two things learned building the first fixer, both still true:

- Cloudflare Pages' static `_headers`/`_redirects` **can't branch on the `Accept` request header**
  the way Vercel's `routes[].has` could — the negotiation fix had to become a Pages Function
  (`functions/_middleware.js`), not a static config file. This is the one place the CF Pages port of
  the original Vercel-based fix isn't a drop-in translation.
- The whole loop, **including before/after score verification, runs with no live deployment**:
  `wrangler pages dev <dist>` emulates Cloudflare Pages (static assets + Functions) locally and
  afdocs happily scans `http://localhost:<port>`. Hosted scanners (`is-agentic`, `ora`) can't reach
  localhost, which is why the fixer's exit criterion was defined as an afdocs number.

**Safety rule (still standing):** `enhance` never commits or pushes. It writes to the working tree
and either opens a PR (if a git remote + authenticated `gh` exists) or leaves an unstaged diff for
review. Repo mutation isn't reversible for free, so the tool always shows-before-does. It also never
overwrites a file the target already has — it skips and reports.

## 7. Report format

Two reports, same schema so before/after is a mechanical diff:

- `report.json` — machine-readable: per-scanner scores, per-check status (pass/warn/fail), evidence
  (URLs, byte counts, header values).
- `report.md` — human-readable scorecard (score progression, category breakdown, fix-to-check
  mapping, remaining backlog).

`diff-report.md` (step 4 output) = baseline vs re-scan in the same before/after style, plus a
"manual/backlog" section for checks that require content authoring (e.g. page-size splitting)
rather than infrastructure fixes — flagged, never auto-applied.

## 8. Release plan / milestones

| Version | Scope | Outcome |
|---|---|---|
| **v0.1** | Scan + report only. Single scanner: afdocs CLI. No auto-fix. | Done. |
| **v0.2** | Add Vercel Is Agentic as a second CLI scanner and promote it to primary (afdocs becomes supplementary/doc-heavy). Unified scorecard across both. | Done. |
| **v0.3** | First fixer: Astro + Starlight + Cloudflare Pages, re-derived for CF Pages as a Pages Function (§6). | Done — **0/100 (F) → 97/100 (A)** on the reference fixture, measured locally via `wrangler pages dev`, no deployment. |
| **v0.4** | Re-scan + diff report (step 4 closes the loop). PR-based apply flow. | Done — shipped as the `loop` command: `scan → enhance → rescan → diff-report` end-to-end on a pristine, fixer-stripped fixture copy, zero manual steps. Plus `rescan`, standalone `diff-report`, and opt-in `enhance --pr`. |
| **v1.0 (MVP public launch)** | Both CLI scanners + one fixer + the full loop, verified on Windows and macOS (§11). CI matrix green. README with sanitized case study, CONTRIBUTING, MIT license, semver'd releases. | Done — tagged `v1.0.0`, CI green on all three platforms, repo public at https://github.com/dkdev24/siteready. |
| **v1.x (post-MVP)** | Additional framework/platform adapters by demand; promote the Linux CI job from best-effort to required; revisit Glippy MCP or a ToS-safe Cloudflare integration if they'd close a real gap. | In progress — see `NEXT_ACTIONS.md`. Each addition ships as an isolated module per §4/§6, no core rewrite. |

The MVP bar deliberately moved from "one scanner + n fixers" to "both CLI scanners + one fixer,
working cross-platform": scanning breadth and actually running on the maintainer's daily machines
mattered more for v1 credibility than breadth of framework support. That tradeoff has since
inverted — **fixer/platform coverage is now the binding constraint** (`NEXT_ACTIONS.md` #12).

> **Shipped after v1.0, not in this plan:** the plain-Astro (no Starlight) fixer; the Ora scanner;
> scanner-version pinning plus drift tooling and its weekly Action; `SKILL.md`; the tool-vs-skill
> repositioning and npm packaging. `WORKLOG.md` is the authoritative record from v1.0 onward.

## 9. Repo scaffolding checklist (done at the v1.0 cut)

- [x] MIT `LICENSE`
- [x] `README.md` — problem statement, quickstart, sanitized before/after case study, supported
      frameworks/scanners matrix
- [x] `CONTRIBUTING.md` — how to add a new scanner adapter or fixer (both additive plugins;
      document the interface contract, not just examples)
- [x] `SKILL.md` — agent-facing adapter over the CLI
- [x] `examples/astro-starlight-cf-pages/` — a minimal, from-scratch fixture (not a real internal
      repo) that starts at a real low score and can be fixed live in a demo/CI test
- [x] CI: lint + a scripted run of the fixture through the full loop, asserting the score improves
      (`scripts/check-syntax.js`, `scripts/verify-loop.js`)
- [x] Issue templates: "new scanner adapter," "new framework fixer"

## 10. Risks / open questions (as originally identified)

- **Scanner ToS**: Cloudflare's isitagentready.com is a web app without a confirmed public API —
  kept manual/optional (§5) specifically to avoid headless browsing, which could violate ToS or get
  rate-limited. Don't revisit that decision by scraping quietly; either find a real API/CLI or leave
  it manual. *(Still standing.)*
- **Hosted scanner API stability**: Is Agentic is a new CLI wrapping a hosted scan service — confirm
  its JSON schema doesn't change format across releases before pinning. *(Actioned: exact-version
  pins per adapter, plus `npm run check-scanner-versions` and a weekly drift Action.)*
- **Auto-fix correctness across frameworks**: a fixer that works for Astro/Starlight may write
  invalid config for a differently-structured Astro site. Each fixer needs its own fixture tests,
  not just the one reference site. *(Partly actioned — the plain-Astro fixer was scoped narrower for
  exactly this reason, and got its own `examples/astro-cf-pages/` fixture.)*
- **Drift**: scanners change their check sets (the AFDocs spec is young), so the normalizer needs
  versioned schemas per scanner, not hardcoded field names. *(Still live — see `NEXT_ACTIONS.md` #8
  on Ora's per-check id stability.)*
- **Attribution**: if a third-party MCP server is used, credit it in README rather than presenting
  the result as this tool's own analysis. *(Still standing.)*
- **Enhance's local-repo precondition**: unlike scan/report/re-scan (URL-only), enhance requires a
  local checkout (§1, §6) — the tool must make this clear in its own UX, not fail confusingly deep
  in stack detection. Deliberately **not** in scope: fixing platform settings that live only in a
  dashboard/API, which would require the tool to hold platform API credentials (Cloudflare/Vercel/
  Netlify tokens) — a security/trust surface well beyond "writes local files, opens a PR." If that
  gap ever matters, it's a distinct, explicitly-scoped future capability, not something to quietly
  bolt onto `enhance`. *(Still standing.)*

## 11. Platform support

**Requirement:** the tool is CLI-driven (npx-based scanners, file-editing fixers), so "does it run
on my machine" is a real correctness gate, not a nice-to-have. **Windows and macOS both must
work.** Linux is expected to work (same Node/npx mechanics) and is tested in CI.

### The bug this caught

Building the first prototype's CLI-invocation logic surfaced a cross-platform bug before any macOS
testing happened at all. The code resolved npm's bundled `npx-cli.js` relative to the running Node
binary to avoid PATH ambiguity (a Windows `cmd.exe`-resolved `npx.cmd` had turned out to point at a
different, broken Node/npm install than the one running the script) — but the first-pass POSIX
fallback assumed `<node-bin-dir>/lib/node_modules/npm/bin/npx-cli.js`. That's wrong for the standard
tarball/nvm/fnm layout, where `bin/` and `lib/` are **siblings** one level up from the node binary,
not nested inside `bin/`:

- Windows installer layout: `<root>/node.exe`, `<root>/node_modules/npm/bin/npx-cli.js` (no separate
  `bin/` — why the original Windows-only fix looked complete but wasn't general).
- POSIX tarball / nvm / fnm: `<root>/bin/node`, `<root>/lib/node_modules/npm/bin/npx-cli.js`.
- Homebrew adds a third wrinkle: `/usr/local/bin/node` is a symlink into a versioned Cellar path —
  resolving `process.execPath` through `fs.realpathSync` first is required, or the derived install
  root is wrong.

This was caught by reasoning through the file layout while writing this section, **not** by running
on an actual Mac — meaning it would very likely have shipped broken and failed silently. Fixed in
`src/lib/npx-runner.js`, which tries all three known layouts (existence-checked, first match wins)
and falls back to a PATH-resolved `npx`/`npx.cmd` only if none match.

### Standing design rules

- **Every CLI scanner adapter must go through `npx-runner.js`**, not reimplement its own
  `child_process` invocation — this bug class is exactly what a single shared, tested module is for.
  (Ora is the one exception, and only because it has no CLI at all: it's a direct `fetch()`.)
- **CI is the intended verification, not local testing on one machine** — a windows-latest +
  macos-latest + ubuntu-latest matrix. *(Shipped and green; this is what actually confirmed the
  macOS leg, since no Mac was available to test by hand.)*
- **Don't treat a scanner CLI's non-zero exit code as a tool failure.** Both afdocs and Is Agentic
  exit non-zero when the *scanned site* fails checks — the expected, common case for a "before"
  baseline, not a broken invocation. `npx-runner.js` only treats an invocation as failed when
  there's no stdout to parse. (Testing only against an already-97/100 site never hits this path.)
- Fixers write text-based config files (JSON/YAML/Astro/JS) — no shell scripts, no platform-specific
  file operations beyond Node's own `fs`/`path`, so they need no OS branching. The platform-specific
  risk is entirely in *invoking tools*, not in *editing files*.

## 12. Extraction (done)

This project began as an extended output of an internal assessment effort and was always intended to
ship as a separate, standalone public repo rather than live inside a private one. Extraction was
deliberately timed at the v1.0 cut, not before: cheaper to iterate against a real fixture first, and
it meant the public repo's first commit was already a working v1.0 rather than a half-built
prototype with an issue tracker nobody should file against yet.

That happened — the tool now lives at **https://github.com/dkdev24/siteready** with its own history,
CI, and backlog. This file is the seed plan only; `WORKLOG.md` is the ongoing record.

## 13. Known-wrong list (why this doc is frozen, not maintained)

Places this plan no longer matches reality, collected so a reader doesn't have to diff it against
the code:

| § | Plan says | Reality |
|---|---|---|
| 1, 4 | The project is "a Claude Code **skill**" | It's a **CLI tool**; `SKILL.md` is a thin agent-facing adapter with no logic of its own (README "What this is: a tool, not a skill"; `AGENTS.md` rule 1) |
| 4 | TypeScript, a `scripts/` dir of separate entry points | JavaScript (ESM), one `src/cli.js` entry point, everything under `src/` |
| 4 | `references/standards.md`, `references/check-catalog.md` | Never written; README's "Design notes" absorbed the role |
| 4 | `src/loop.js`, `src/lib/*` | Not in the plan at all — `loop`, `npx-runner`, `local-server`, `tunnel` all emerged during build |
| 5 | Two scanners (afdocs, Is Agentic) | Three — Ora added, opt-in, as the engine Is Agentic wraps |
| 5 | Bare `npx` invocation | Pinned exact versions per adapter + drift tooling + a weekly Action |
| 6 | One fixer (Astro + Starlight + CF Pages) | Two — plain Astro (no Starlight) + CF Pages also ships, deliberately narrower |
| 8 | Ends at v1.0 | Engine is at 1.3.1; see `WORKLOG.md` |
| 11 | CI "currently deferred" | Shipped and green on all three platforms |

Anything not in this table should still be read as historical intent, not as a current claim.
