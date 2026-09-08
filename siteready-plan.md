# siteready — OSS Project & Release Plan

> Spin-off of the DoveRunner Agent Readiness Assessment (ARA) work into a
> framework-agnostic, publicly released tool. Origin case study: `docs.doverunner.com`
> (Astro + Starlight, originally on Vercel, now Cloudflare Pages), taken from 0/100 (F) to
> 99/100 (A) — see `references/afdocs-score-improvement-plan.md` and
> `references/AgentScoreFixReport.md`.
>
> **2026-09-08 update:** scanner lineup and v1 MVP target revised — see the "updated 2026-09-08"
> notes in §5, §6, and §8.
>
> **2026-09-08 update 2:** cross-platform support (Windows + macOS required for v1 MVP) added as
> an explicit requirement — see §11. This surfaced a real bug in the v0.1 prototype's CLI-runner
> logic (fixed same day, see §11 and §10).
>
> **2026-09-08 update 3:** project renamed from "website-agent-readiness-enhancer" to
> **siteready** — same scope, shorter and easier to type/recall. `tools/website-agent-readiness-enhancer/`
> is now `tools/siteready/`; this file was `website-agent-readiness-enhancer-plan.md`.
>
> **2026-09-08 update 4:** `.github/workflows/siteready-ci.yml` removed (was sending a failure
> email on every push, since this repo is otherwise private/quiet). Cross-platform verification is
> manual for now (run the CLI locally on each OS before calling a version done); the CI matrix
> described in §11 is deferred, not abandoned — re-add before the v1.0 public cut, where it's load-
> bearing for the "verified on Windows and macOS" claim in front of external contributors.
>
> **2026-09-08 update 5:** v0.3 (first fixer) shipped same day. Two things learned while building
> and verifying it, both now folded into §6/§8 above:
> - Cloudflare Pages' static `_headers`/`_redirects` can't branch on the `Accept` request header the
>   way Vercel's `routes[].has` could — the negotiation fix had to become a Pages Function
>   (`functions/_middleware.js`), not a static config file. This is the one place the CF Pages port
>   of the original Vercel-based fix (`references/markdown-negotiation-plan.md`) isn't a drop-in
>   translation.
> - The whole loop — including the "before/after" score verification — runs **without any live
>   deployment**: `wrangler pages dev <dist>` emulates Cloudflare Pages (static assets + Functions)
>   locally, and afdocs happily scans `http://localhost:<port>`. Only `is-agentic` can't (its CLI
>   submits to a hosted scan service, not a local fetch), which is fine since v0.3's exit criterion
>   is explicitly an afdocs-style 0→~99 number, matching how the original DoveRunner case study was
>   itself measured.
>
> **2026-09-08 update 6:** v0.4 (re-scan + diff report + closed loop) shipped same day. Exit
> criterion met and verified: `siteready loop <repo>` runs `scan → enhance → rescan → diff-report`
> end-to-end against a pristine copy of `examples/astro-starlight-cf-pages` (fixer output stripped)
> with zero manual steps — **0/100 (F) → 97/100 (A)**, automating the exact `wrangler pages dev`
> sequence update 5 above required by hand. Also shipped: `rescan` (re-run a baseline's own
> scanner set against a URL, diff automatically), standalone `diff-report` (diff two existing
> report.json files), and an opt-in `enhance --pr` flow (commit written files to a branch, push,
> open a PR via `gh`; degrades to v0.3's "unstaged diff" behavior if there's no git remote or `gh`
> isn't authenticated — never runs without the flag). One more cross-platform bug surfaced building
> `loop`'s local-server automation, same class as the one §11 already documents: `spawn('npm.cmd',
> args)` fails with `EINVAL` on Windows unless `shell: true` is set — hit here because `loop` is the
> first code path to shell out to plain `npm` rather than an npx-wrapped scanner CLI. Fixed in
> `tools/siteready/src/lib/local-server.js`.
>
> **2026-09-08 update 7:** v1.0 pre-extraction work started same day. Pinned both scanner CLIs to
> exact versions (`afdocs@0.20.0`, `is-agentic@1.0.1`, in each adapter file) instead of an
> unpinned `npx` call, per the §10 risk about a schema change silently breaking scans — re-verified
> both against a real merged scan afterward. Did the §3 sanitization pass: removed every
> DoveRunner-specific reference and every relative link to this private repo's own `references/`
> from `tools/siteready/`'s own README, the example fixture's README, and code comments, so the
> tool now reads as fully self-contained. Added the §9 scaffolding items that don't require the
> repo to already be public: `LICENSE` (MIT), `CONTRIBUTING.md` (scanner-adapter and fixer
> interface contracts), two issue templates, and a CI workflow (`tools/siteready/.github/workflows/ci.yml`
> — windows-latest + macos-latest required, ubuntu-latest best-effort) plus the two checks it runs:
> `scripts/check-syntax.js` (lint stand-in) and `scripts/verify-loop.js` (strips the reference
> fixture's fixer output back out in a temp copy, runs `loop` against it, asserts the score
> actually improves — not just that the code runs). Both scripts verified locally.
>
> Clarified with Daniel what "extraction" (§12) concretely means: not just a documentation/scope
> boundary, but physically moving `tools/siteready/` to `~/Projects/siteready` (a sibling of this
> repo) and initializing a new, separate public GitHub repo there — the CI workflow's actual
> trigger only matters once it lives in that new repo, not this one. Drafted the CI workflow file
> now anyway since it lives inside `tools/siteready/.github/` and travels with the folder
> automatically at move time; it does nothing here (GitHub Actions only reads a repo's *root*
> `.github/workflows/`, and this repo's root already had its own — now-removed — one, see update 4
> above). **The move + new-repo creation itself is deliberately not done yet** — still pending a
> decision on the new repo's name/visibility/owning account before that (irreversible-once-public)
> step.
>
> **2026-09-08 update 8:** The move happened same day, once the specifics were confirmed
> (`siteready`, personal GitHub account, private until CI is green, a fresh single-commit history
> rather than carrying over the v0.1-v0.4 commits). `tools/siteready/` was copied to
> `~/Projects/siteready` (a sibling of this repo), given one clean initial commit, and pushed to a
> new **private** repo at `github.com/dkdev24/siteready`. Its own CI (windows-latest + macos-latest
> required, ubuntu-latest best-effort) kicked off on that first push — this is what will actually
> confirm the macOS leg of §11's requirement, since no Mac was available to test by hand. The
> now-redundant copy at `tools/siteready/` was removed from this repo in the same session. Once CI
> is confirmed green (all three platforms, or at minimum both required ones), remaining steps to
> close v1.0: bump `package.json` to `1.0.0`, tag `v1.0.0`, flip the new repo to public. This repo
> (`agent-readiness-assessment`) no longer tracks siteready's source at all — future siteready work
> happens in `~/Projects/siteready` directly; this plan file stays here as the historical seed
> plan (§12) but is no longer updated for siteready's own day-to-day changes.
>
> **2026-09-08 update 9 — v1.0.0 shipped:** CI found two real bugs on the very first push, both
> fixed same day: (1) the workflow was pinned to Node 20, but the example fixture's Astro
> dependency had floated to a version requiring Node ≥22.12 — failed identically on all three
> OSes, confirming it was a Node version issue, not a platform one; fixed by bumping CI to Node 22.
> (2) after that fix, Windows alone still failed — `scripts/verify-loop.js`'s regex for stripping
> the fixer's Banner registration back out of a temp copy assumed LF line endings, but Windows
> `git checkout` converts to CRLF, so the strip silently no-op'd and left a dangling import to a
> file the script had already deleted. Confirmed this was isolated to the verification script, not
> the real `enhance`/fixer code (which uses looser regexes with no `\n`-adjacency assumption).
> Fixed by matching `\r?\n` and making the strip throw loudly if it ever fails to match again.
> Re-ran CI after each fix; green on all three platforms on the `v1.0.0` commit — this is what
> actually confirmed the macOS leg of §11's requirement, since no Mac was available to test by
> hand. Tagged `v1.0.0`, then flipped the repo from private to public:
> **https://github.com/dkdev24/siteready**. v1.0 is done; all future siteready work happens there.
>
> **2026-09-08 update 10:** the §9 scaffolding checklist's remaining item — `SKILL.md` — started
> in this session. Since siteready is meant to be usable both as a plain CLI and as a Claude Code
> skill (§1), `SKILL.md` at the repo root wraps the same four CLI commands (`scan`/`enhance`/
> `rescan`/`loop`) with orchestration instructions for an agent: when to run each step, the
> local-checkout precondition on `enhance` (§1, §6), and the safety rule that `enhance` never
> commits/pushes on its own (§6). Written directly against `README.md`/`CONTRIBUTING.md` rather
> than through the full skill-creator eval loop — the underlying tool is deterministic CLI
> commands with no subjective output to benchmark, so that process is overkill here; a quick vibe
> check against a couple of real prompts is enough before shipping it.

---

## 1. What it is

A Claude Code **skill** (installable via plugin/marketplace, MIT-licensed, public GitHub repo)
that runs a closed loop on any website or doc site:

1. **Scan** — run the site through multiple agent-readiness scanners.
2. **Report** — normalize results into one baseline scorecard (score, grade, failing/warn checks, evidence).
3. **Enhance** — detect the site's framework/host and apply the matching fixes (as a diff/PR, never a silent commit).
4. **Re-scan** — run the same scanners again, diff against baseline, produce a before/after result report.

Not a new scanner. It's an **orchestration + remediation layer** on top of existing scanners,
because no single scanner covers the whole standard (discoverability, governance, controlled
interaction — per `references/ai-agent-readiness-guide.md` §3), and none of them auto-fix anything.

**Input requirements differ by step (added 2026-09-08):** steps 1/2/4 (scan, report, re-scan) only
ever need a public URL — the scanners hit the live site over HTTP, nothing local required. Step 3
(enhance) is architecturally different: the fixes are source-file edits (an `llms.txt` endpoint, a
layout override, a `_headers`/`vercel.json` config) and platform-config edits, so **enhance requires
local filesystem access to the target site's own repo** (checked out, with the relevant framework
and platform config files present), not just its URL. There's no way to write "add a
`src/pages/llms.txt.ts` file" against a URL alone. This is naturally satisfied when the skill is run
by Claude Code from inside the user's own project directory (the common case), but it's a real
constraint worth stating up front: **scan/report/re-scan work on any site you don't control the
code for; enhance only works on a site whose repo you have checked out.** See §6 for how this
shapes the fixer/platform adapter design, and §9 for how the example fixture is structured around it.

**Scanner priority (updated 2026-09-08):** CLI-based scanners come first because they're
scriptable, ToS-safe, and rate-limit-free — that's the whole reason this can be a CLI-driven skill
instead of a browser-automation tool. Web-only scanners (Cloudflare isitagentready, Fern Agent
Score) are demoted to manual/optional; see §5.

## 2. Why this is worth open-sourcing

- Every scanner we used (afdocs, Vercel Is Agentic, Fern Agent Score, Cloudflare isitagentready,
  Glippy) tells you what's wrong. None of them touch your repo. The DoveRunner fix (Phase 1 in
  `afdocs-score-improvement-plan.md`) took real engineering judgment — this project encodes
  that judgment as reusable, framework-detected patches instead of one-off consulting.
- The DoveRunner case study is a strong, provable demo: real before/after scores, real diffs,
  zero new npm dependencies. That's rare for an agent-readiness tool and worth leading with.
- "Agent readiness" tooling is early and fragmented (11+ competing standards per the Hard2bit
  reference). A neutral, multi-scanner aggregator has a natural reason to exist independent of
  any one vendor's scanner.

## 3. Scope boundary (what does NOT come from this repo)

Everything DoveRunner-specific stays private:
- KPI/MBO references, Confluence links, internal scenario files, `docs/` source content.
- The DoveRunner case study appears in the OSS README only as a **sanitized, generic example**
  (framework + before/after scores + the class of fix), not as a walkthrough of DoveRunner's
  actual repo or docs.
Only the *methodology* and *code* generalize. Audit before first public push.

## 4. Architecture

```
siteready/
├── SKILL.md                     # entry point, orchestration instructions
├── scripts/
│   ├── scan.ts                  # runs all configured scanner adapters, writes raw results
│   ├── report.ts                # normalizes raw results -> unified scorecard (JSON + MD)
│   ├── detect-stack.ts          # framework/host fingerprinting FROM THE LOCAL REPO (package.json,
│   │                             #   astro.config.mjs, vercel.json/wrangler.toml, etc.) — enhance
│   │                             #   needs the local checkout, not just the URL; see §1
│   ├── enhance.ts               # applies matched fixers, produces a git diff / PR
│   └── diff-report.ts           # baseline vs re-scan -> before/after MD report
├── scanners/                    # pluggable scanner adapters (see §5) — Tier 1 (CLI) first
│   ├── is-agentic.ts             # primary
│   ├── afdocs.ts                 # supplementary, doc-heavy sites
│   ├── cloudflare-isitagentready.ts  # Tier 2, manual/optional — not auto-run
│   └── glippy.ts                 # Tier 2, deferred (MCP-based)
├── fixers/                      # pluggable, framework-scoped remediation (see §6)
│   ├── astro-starlight/
│   ├── nextjs/
│   ├── docusaurus/
│   ├── vitepress/
│   └── generic-static/
├── platforms/                   # deployment-target adapters for negotiation/headers (see §6)
│   ├── cloudflare-pages.ts       # v1 priority
│   ├── vercel.ts
│   ├── netlify.ts
│   └── nginx.ts
├── references/
│   ├── standards.md              # llms.txt, AFDocs spec, Content-Signal, RFC 9727, MCP server cards
│   └── check-catalog.md          # every check, which scanner(s) report it, which fixer resolves it
└── examples/
    └── astro-starlight-cf-pages/ # the proven, sanitized reference fixture (v1 target stack)
```

Each scanner adapter and each fixer is independently pluggable — a scanner going offline or a
framework having no fixer yet must degrade to "unsupported," never break the pipeline.

## 5. Scanner adapters (pluggable, degrade gracefully)

Two tiers: **CLI scanners** (in MVP, always run) and **web-only scanners** (out of MVP, manual/optional).

### Tier 1 — CLI scanners (v1 MVP)

| Scanner | Type | Integration | Role |
|---|---|---|---|
| **Vercel Is Agentic** (`npx is-agentic <url> --json`) | CLI, general-purpose site scanner | Direct CLI wrap, JSON output (confirmed: `{ score, score_breakdown: {essential, recommended, bonus}, issues: [{id, name, tier, result, details, recommendation}] }`) | **Primary scanner.** Checks apply to *any* content site — OpenAPI spec, JSON-LD, JSON error responses, agent-friendly 404s, etc. — not just doc sites. |
| **afdocs** (`npx afdocs check`) | CLI, open spec (agentdocsspec.com) | Direct CLI wrap, JSON output. Already proven end-to-end (see `tools/siteready/src/scanners/afdocs.js`). | **Supplementary scanner**, run in addition to Is Agentic when the target is document-heavy (a docs subdomain/path, a Starlight/Docusaurus/etc. site — see stack detection in §6). Adds doc-specific checks (llms.txt, markdown mirrors, content negotiation, page-size/parity) that Is Agentic doesn't cover. |

Both are npx-based, no browser automation, no confirmed ToS friction, no rate limits observed —
this is why the MVP scanner set is these two and nothing else.

### Tier 2 — web-only scanners (post-MVP, manual/optional, not auto-run)

| Scanner | Status | Notes |
|---|---|---|
| **Cloudflare isitagentready.com** | Optional, manual | Web app only, no confirmed public API. 4-dimension score (discoverability, content, bot control, protocol). Users can paste a link to their own scan into the report by hand; not orchestrated by this tool. |
| **Fern Agent Score** | **Dropped from the roadmap** | Same underlying logic as afdocs — both implement the AFDocs standard (agentdocsspec.com). Running both would just double-report the same checks under two labels. afdocs is kept because it has a real CLI; Fern's is a web app. |
| **Glippy** | Deferred, not MVP | Has an MCP server (per `ai-agent-readiness-guide.md` ref #6) — the cleanest non-CLI integration path if/when it's wanted, but CLI scanners cover the MVP's needs first. Revisit post-v1 if Is Agentic + afdocs leave a coverage gap Glippy's GEO-style checks would fill. |

Design rule: **never scrape a scanner UI as a first resort.** Prefer CLI/API/MCP. If a scanner has
no CLI/API (Cloudflare's), it stays manual/optional rather than being automated via headless
browser. Let the user select which Tier-1 scanners run per invocation
(`--scanners is-agentic,afdocs`), defaulting to both when the target looks doc-heavy and to
Is Agentic alone otherwise.

## 6. Fixers (framework + platform matrix)

**Precondition: a local checkout of the target site's repo** (see §1 — this is what separates
enhance from scan/report/re-scan). Every fix in the table below is a source-file edit, so
`detect-stack.ts` reads `package.json`, framework config files, and platform config files
(`vercel.json`, `_headers`, `wrangler.toml`, `netlify.toml`, ...) **from the local filesystem**, not
from the live site. In scope only: platform behavior that's expressible as a repo-committed config
file (which covers every fix in the table for the frameworks/platforms targeted here). Out of
scope for the fixer (flagged as a manual backlog item if hit, not attempted): platform settings
that only exist in a dashboard/API and aren't committed to the repo (e.g. some CDN cache/WAF rules)
— fixing those would need platform API credentials, a materially bigger trust/security surface
this project isn't taking on. See §10 for this as a tracked risk.

The DoveRunner fix set generalizes into two orthogonal axes — **framework** (what generates the
site) and **platform** (what serves it, i.e. where negotiation/headers get configured):

| Fix | Framework hook | Platform hook |
|---|---|---|
| `llms.txt` generation | Astro/Next/Docusaurus/VitePress-native content collection API | — |
| `.md` mirror routes | Framework routing (custom endpoint per framework) | — |
| Body-level llms.txt directive | Framework layout/theme override | — |
| Content-Signal / AI robots.txt rules | Framework's robots.txt generator | — |
| `Accept: text/markdown` negotiation | — | **Cloudflare Pages `_headers`/`_redirects` (v1 priority)**, Vercel rewrites/headers, Netlify `_redirects`/`_headers`, Nginx `map`/`try_files` |
| Sitemap freshness | Framework sitemap integration | — |
| `Last-Modified` headers | — | Platform config |

v1 ships **Astro + Starlight + Cloudflare Pages** (updated 2026-09-08 — DoveRunner Docs moved off
Vercel to Cloudflare Pages, so this is now the live reference deployment). The original
Astro+Starlight+Vercel fix set (proven in `references/afdocs-score-improvement-plan.md`) still
generalizes framework-side (llms.txt endpoint, `.md` mirror routes, body-level directive); only
the platform-side negotiation/headers fix needs re-deriving for Cloudflare Pages `_headers` /
`_redirects` instead of `vercel.json` rewrites. Each additional framework/platform pair after that
is an additive, isolated module — never a rewrite of the core pipeline. Vercel support is not
dropped, just reordered behind Cloudflare Pages for v1.

**Safety rule:** `enhance.ts` never commits or pushes. It writes changes to the working tree and
either opens a PR (if a git remote + gh/token is configured) or leaves an unstaged diff for the
user to review. This mirrors the "risky action" guidance — repo mutation is not reversible for
free, so the tool must always show-before-do.

## 7. Report format

Two reports, same schema so before/after is a mechanical diff:

- `report.json` — machine-readable: per-scanner scores, per-check status (pass/warn/fail),
  evidence (URLs, byte counts, header values).
- `report.md` — human-readable scorecard, modeled on the existing
  `afdocs-score-improvement-plan.md` table format (score progression, category breakdown,
  fix-to-check mapping, remaining backlog).

`diff-report.md` (step 4 output) = baseline vs re-scan, in the same before/after style as
DoveRunner's own progression table (0→91→96→99), plus a "manual/backlog" section for checks that
require content authoring (e.g. page-size splitting) rather than infrastructure fixes — these are
flagged, never auto-applied.

## 8. Release plan / milestones

| Version | Scope | Exit criteria |
|---|---|---|
| **v0.1** — done | Scan + report only. Single scanner: afdocs CLI. No auto-fix. | Prototype at `tools/siteready` runs against `docs.doverunner.com`, produces `report.md`. |
| **v0.2** — done | Add Vercel Is Agentic as the second CLI scanner and promote it to **primary** (afdocs becomes supplementary/doc-heavy-only, per §5). Unified scorecard across both. | Running against any public site (doc-heavy or not) produces one merged `report.md`; a non-doc site still gets a useful Is Agentic-only report. |
| **v0.3** — done | First fixer: Astro + Starlight + Cloudflare Pages (the DoveRunner pattern, re-derived for Cloudflare Pages — a Pages Function rather than `_headers`/`_redirects`, since those can't branch on the `Accept` header the way Vercel's `routes.has` could; see §6). | Re-running on the sanitized `examples/astro-starlight-cf-pages` fixture reproduces a 0→~99-style improvement from a clean baseline. **Verified: 0/100 (F) → 97/100 (A)**, both measured locally via `wrangler pages dev` (no live deployment needed — afdocs runs a real local fetch; is-agentic can't reach localhost since its CLI submits to a hosted scan service, but that's orthogonal to the fixer itself). |
| **v0.4** — done | Re-scan + diff report (step 4 closes the loop). PR-based apply flow. | `enhance` → `rescan` → `diff-report` runs end-to-end on the reference fixture with no manual steps. **Verified via the new `loop` command: 0/100 (F) → 97/100 (A)** on a pristine (fixer-stripped) copy of `examples/astro-starlight-cf-pages`, fully local via `wrangler pages dev` automation, zero manual steps. |
| **v1.0 (MVP public launch)** — **done** | **Both CLI scanners (afdocs + Is Agentic) + one fixer (Astro/Starlight/Cloudflare Pages) + the full scan→report→enhance→rescan loop, verified on Windows and macOS (§11).** Web-only scanners (Cloudflare isitagentready) are explicitly out of MVP — manual/optional only. Fern Agent Score is not included at all (redundant with afdocs, see §5). CI matrix (windows-latest + macos-latest required, ubuntu-latest best-effort) green. README with the sanitized case study, CONTRIBUTING guide, MIT license, semver'd releases. | **Tagged `v1.0.0`, CI green on all three platforms, repo public: https://github.com/dkdev24/siteready (update 9).** A user can scan any site, get a merged CLI-scanner scorecard, and — for an Astro+Starlight+CF-Pages site — auto-fix and get a before/after diff report end-to-end, on Windows, macOS, or Linux. |
| **v1.x (post-MVP)** | Additional framework/platform adapters (Vercel, Netlify, Docusaurus, Next.js) by GitHub issue demand; promote the Linux CI job from best-effort to required once someone's actually depending on it; revisit Glippy MCP or a ToS-safe Cloudflare isitagentready integration if they'd close a real coverage gap. | Each addition ships as an isolated module per §4/§6 — no core rewrite. |

Ship each version as a usable increment — v0.1/v0.2 alone are already useful as a "just tell me my
score(s)" tool, before any auto-fix code exists. The MVP bar moved from "one scanner + n fixers" to
"both CLI scanners + one fixer, working on Windows and macOS" per the 2026-09-08 reviews (§5, §11) —
scanning breadth and actually running on Daniel's two work machines matter more for v1 credibility
than breadth of framework support.

## 9. Repo scaffolding checklist (do at the v1.0 cut — i.e. extraction time, see §12)

Development through v0.1–v0.4 stays inside this private repo, at `tools/siteready/` — there's
nothing here to scaffold yet (no fixer exists before v0.3, no full loop before v0.4, so most of
this checklist can't even be completed earlier). The checklist runs once, when
`tools/siteready/` is extracted into its own public GitHub repo as part of the v1.0 launch:

- [ ] MIT `LICENSE`
- [ ] `README.md` — problem statement, quickstart, sanitized before/after case study, supported
      frameworks/scanners matrix (table above, kept current)
- [ ] `CONTRIBUTING.md` — how to add a new scanner adapter or fixer (both are additive plugins;
      document the interface contract, not just examples)
- [ ] `SKILL.md` per skill-creator conventions
- [ ] `examples/astro-starlight-cf-pages/` — a minimal, from-scratch fixture (not DoveRunner's real
      repo) that starts at a real low score and can be fixed live in a demo/CI test
- [ ] CI: lint + a scripted run of the example fixture through the full scan→report→enhance→rescan
      loop, asserting the score improves
- [ ] Issue templates: "new scanner adapter," "new framework fixer" (keeps contributions scoped)

## 10. Risks / open questions

- **Scanner ToS**: Cloudflare's isitagentready.com is a web app without a confirmed public API —
  it's kept manual/optional (§5) specifically to avoid needing headless browsing, which could
  violate ToS or get rate-limited/blocked. Don't revisit that decision by scraping quietly; either
  find a real API/CLI or leave it manual.
- **Vercel Is Agentic API stability**: it's a new CLI (launched 2026) wrapping a hosted scan
  service (`is-agentic.com`) — confirm its JSON schema (`score_breakdown`, `issues[]`) doesn't
  change format across releases before pinning a version in `package.json`.
- **Auto-fix correctness across frameworks**: a fixer that works for Astro/Starlight may write
  invalid config for a differently-structured Astro site. Each fixer needs its own fixture tests,
  not just the one reference site.
- **Drift**: scanners change their check sets (AFDocs spec is young). `check-catalog.md` needs to
  be a living doc, and the normalizer in `report.ts` needs versioned schemas per scanner, not
  hardcoded field names.
- **Attribution**: if Glippy's MCP server is used, credit it in README rather than presenting the
  result as this tool's own analysis.
- **Enhance's local-repo precondition (added 2026-09-08)**: unlike scan/report/re-scan (URL-only),
  enhance requires a local checkout of the target repo (§1, §6) — the tool must make this clear in
  its own UX (error out with a clear message if run against a bare URL with no local repo in
  context, not fail confusingly deep in `detect-stack.ts`). Deliberately **not** in scope: fixing
  platform settings that live only in a dashboard/API rather than a repo-committed config file —
  that would require the tool to hold platform API credentials (Cloudflare/Vercel/Netlify tokens),
  a security/trust surface well beyond "writes local files, opens a PR." If this gap turns out to
  matter in practice, treat it as a distinct, explicitly-scoped future capability — not something
  to quietly bolt onto `enhance.ts`.

## 11. Platform support

**Requirement (added 2026-09-08):** the skill is CLI-driven (npx-based scanners, file-editing
fixers), so "does it run on my machine" is a real MVP gate, not a nice-to-have. **v1 MVP must work
on Windows and macOS** — Daniel uses both day to day. Linux is expected to work (same Node/npx
mechanics) and is tested in CI, but a Linux-only failure does not block a release.

### The bug this already caught

Building the v0.1 prototype's CLI-invocation logic surfaced a real cross-platform bug before any
macOS testing happened at all: the code resolved npm's bundled `npx-cli.js` relative to the
running Node binary to avoid PATH ambiguity (a Windows `cmd.exe`-resolved `npx.cmd` had turned out
to point at a different, broken Node/npm install than the one running the script) — but the
first-pass fallback path for POSIX assumed `<node-bin-dir>/lib/node_modules/npm/bin/npx-cli.js`.
That's wrong for the standard Node.js tarball/nvm/fnm layout, where `bin/` and `lib/` are
**siblings** one level up from the node binary, not nested inside `bin/`:

- Windows installer layout: `<root>/node.exe`, `<root>/node_modules/npm/bin/npx-cli.js` (no
  separate `bin/` — this is why the original Windows-only fix looked complete but wasn't general).
- POSIX tarball / nvm / fnm layout: `<root>/bin/node`, `<root>/lib/node_modules/npm/bin/npx-cli.js`.
- Homebrew adds a third wrinkle: `/usr/local/bin/node` is a symlink into a versioned Cellar path —
  resolving `process.execPath` through `fs.realpathSync` first is required, or the derived
  "install root" is wrong.

This was caught by reasoning through the file layout while writing this section, **not** by
running on an actual Mac — meaning it would very likely have shipped broken and failed silently
the first time this ran on Daniel's macOS machine. Fixed in
`tools/siteready/src/lib/npx-runner.js`, which now tries all three known
layouts (existence-checked, first match wins) and falls back to a PATH-resolved `npx`/`npx.cmd`
(with manual shell-arg quoting, since Node doesn't escape array args under `shell:true`) only if
none of the known layouts match.

### Standing design rules

- **Every future CLI scanner adapter (is-agentic in v0.2 included) must go through
  `npx-runner.js`**, not reimplement its own `child_process` invocation — this bug class is exactly
  what a single shared, tested module is for.
- **CI is the intended actual verification, not local testing on one machine** — a windows-latest +
  macos-latest matrix, doing a real scan-and-report smoke test against a stable target
  (`example.com`, `--sampling none`, so it's fast and doesn't depend on DoveRunner's or anyone
  else's infrastructure being up). **Currently deferred** (update 4 above) — re-add
  `.github/workflows/siteready-ci.yml` before the v1.0 cut; until then, run the CLI manually on
  each target OS before calling a version done.
- **Don't treat a scanner CLI's non-zero exit code as a tool failure.** Both afdocs and (per its
  `--json` flag, likely) Is Agentic exit non-zero when the *scanned site* fails checks — that's the
  expected, common case for a "before" baseline, not a broken invocation. `npx-runner.js` only
  treats an invocation as failed when there's no stdout to parse; a real parse failure surfaces as
  its own clear error rather than being masked as an "exec failed" message. (This was the second
  bug the CI smoke test caught the same day — testing only against DoveRunner's own 97/100 site
  never would have hit it, since a site with zero failing checks never exercises this path.)
- Fixers (§6) write text-based config files (JSON/YAML/Astro/JS) — no shell scripts, no
  platform-specific file operations beyond Node's own `fs`/`path`, so they need no OS branching of
  their own. The platform-specific risk is entirely in *invoking tools*, not in *editing files*.

## 12. Relationship to the DoveRunner project

This plan is an **extended output** of the ARA project (Owner: Daniel Kim), same category as the
thought-leadership content series in `references/CONTENT-STRATEGY.md`. It reuses the methodology
proven under MBO 7/8/9 but ships as a separate, standalone public repo — not a DoveRunner product,
not maintained inside this private repo.

**Extraction timing: at the v1.0 MVP cut, not before.** Concretely — once §8's v1.0 exit criteria
are met (both CLI scanners + the Astro/Starlight/Cloudflare Pages fixer + the full
scan→report→enhance→rescan loop, cross-platform CI green per §11) — `tools/siteready/` gets pushed
out into a new public GitHub repo (do the §3 sanitization audit as part of that push, and run the
§9 scaffolding checklist there). Everything from v0.1 through v0.4 develops here, inside this
private repo, exactly as it has so far: cheaper to iterate against the real DoveRunner fixture,
and it means the public repo's first commit is already a working v1.0 rather than a half-built
prototype with a public issue tracker nobody should be filing against yet. Track its own
backlog/issues in the new GitHub repo once created; this file is the seed plan only.
