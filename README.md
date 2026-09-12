# siteready

**[Full docs site →](https://dkdev24.github.io/siteready/)**

Scan a website with multiple agent-readiness scanners, get one unified scorecard, auto-fix the
issues a fixer supports for your framework/platform, then re-scan and get a before/after diff.
All from the CLI, no browser automation, no scanner UI scraping.

Not a new scanner. It's an **orchestration + remediation layer** on top of existing scanners,
because no single scanner covers the whole "can an AI agent actually use this site" standard
(discoverability, machine-readable content, controlled interaction), and none of them auto-fix
anything.

siteready doesn't just advise. It ships the fix and proves it worked. Scores come from the
standards' own scanners ([afdocs](https://agentdocsspec.com/), [Is Agentic](https://is-agentic.com/)
/ [Ora](https://ora.ai/)), not from a model grading itself. Fixes are real code, applied
idempotently and verified cross-platform in CI. The local loop shows you the before/after diff
before anything deploys.

## What this is: a tool, not a skill

siteready is a **runnable CLI** — real code with a real binary, a pinned scanner contract, and CI.
It is deliberately *not* a prompt-only "skill," because the value here is in code that has already
been debugged against real sites (see "Why use this…" below), and instructions alone can't carry
that.

It has **two front doors onto the same engine**, and neither is privileged:

| Audience | Entry point | Notes |
|---|---|---|
| **Humans** | the `siteready` binary (or `node src/cli.js` from a source checkout) | Every command below works standalone in any terminal. No agent, no LLM, no API key. |
| **Agents** | `SKILL.md` | A thin adapter — *when* to run which command and how to read the output. It contains no logic of its own; it shells out to the same CLI. |

The rule that keeps this honest: **`SKILL.md` never implements behavior.** If an agent needs
siteready to do something new, that's a change in `src/`, exposed as a CLI flag or command, which
the human CLI gets for free in the same commit. Anything an agent can do here, a human can do by
typing the same command — and vice versa.

## Install

```bash
npm install -g siteready
siteready https://example.com
```

```
1. Scan     — run the site through multiple agent-readiness scanners
2. Report   — normalize results into one scorecard (score, grade, failing/warning checks, evidence)
3. Enhance  — detect the site's framework/host, apply matching fixes as a diff (or a PR), never a silent commit
4. Re-scan  — run the same scanners again, diff against baseline, produce a before/after report
```

Full install guide (npx, source checkout, Claude Code skill setup, Node version): **[docs/install](https://dkdev24.github.io/siteready/install)**

## Status: v1.10

| Piece | Status |
|---|---|
| Scanners | [afdocs](https://agentdocsspec.com/) (doc-heavy sites), [Vercel Is Agentic](https://is-agentic.com/) (any content site) — both run by default. [Ora](https://ora.ai/) (the engine behind Is Agentic) is opt-in (`--scanners ora`) |
| Fixer | Astro + Starlight or plain Astro, on Cloudflare Pages, Netlify, or GitLab Pages; Next.js (App Router) on Vercel or Netlify; Jekyll on GitHub Pages or GitLab Pages |
| Loop | `scan → enhance → rescan → diff-report`, fully local (no live deployment needed) |
| Scan-local | Baseline scan against a repo checkout, no public URL — for a site not deployed yet |
| Skill install | `install-skill` — writes SKILL.md for Claude Code, Codex CLI, and OpenCode |
| CI | Windows, macOS, and Linux, on every push — see `.github/workflows/ci.yml` |
| Other frameworks/platforms | Not yet — additive, by demand (see Contributing) |

**Real numbers:** the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site from
**0/100 (F) → 97/100 (A)** on afdocs. Fixer-by-fixer rationale (why the plain-Astro and Next.js
fixers are smaller in scope than the Starlight one): **[docs/install](https://dkdev24.github.io/siteready/install)**

## Why use this, instead of pointing an agent at the scanners directly?

Every scanner here already returns a `fix`/`recommendation` string on each failing check, so an
agent with repo access could in principle act on that text directly, no siteready in the loop. The
scan/report layer really is a convenience an agent doesn't strictly need. But the **fixers** are
the real value: turning a scanner's one-line suggestion into idempotent, cross-platform-verified
code is where the actual difficulty lives. And the **loop** (`scan → enhance → rescan →
diff-report`) proves a fix worked before anything deploys, which no ad hoc agent fix session gets
for free. The honest limit is real too: outside the framework/platform combos a fixer covers (see
the Fixer row above), siteready is just a nicer wrapper around scanner output.

This is also a different question than GEO ("Generative Engine Optimization") skill packs answer.
Those are prompt-driven advisors for AI *visibility* (will an LLM mention me). siteready is a build
tool for AI *usability* (can an agent complete a task here), with third-party scores instead of a
model grading itself, and real code instead of suggested templates.

Full comparison, with the specific bugs/edge-cases that make hand-rolled fixes fail in practice:
**[docs/why](https://dkdev24.github.io/siteready/why)**

## Usage

```bash
siteready https://example.com                       # scan + report
siteready enhance ../my-astro-starlight-site         # apply fixes to a local checkout
siteready loop ../my-astro-starlight-site            # scan -> enhance -> rescan -> diff-report
siteready scan-local ../my-astro-starlight-site       # one local scan, no public URL (pre-deploy)
siteready compare https://example.com https://a-competitor.com
siteready monitor https://example.com                # score-over-time from past scans
siteready install-skill claude codex opencode         # install SKILL.md for these agents
```

Every command also has a `rescan`/`diff-report` counterpart and works the same as
`node src/cli.js <command>` from a source checkout. Full command list, every flag, output file
formats, and how `enhance` finds/writes fixes: **[docs/cli-reference](https://dkdev24.github.io/siteready/cli-reference)**

## Architecture

```
siteready/
├── src/
│   ├── cli.js              # entry point: scan / enhance / rescan / diff-report / loop / scan-local
│   ├── scan.js              # runs configured scanner adapters -> normalized report (shared by scan & rescan)
│   ├── report.js            # normalized report -> report.md / report.json
│   ├── diff-report.js       # baseline vs re-scan -> diff-report.md / diff-report.json
│   ├── detect-stack.js      # framework/host fingerprinting from the LOCAL repo (package.json, config files)
│   ├── enhance.js           # detects stack, applies the matching fixer + platform module
│   ├── pr.js                # opt-in enhance --pr flow (branch, commit, push, gh pr create)
│   ├── loop.js               # local scan -> enhance -> rescan -> diff-report orchestration, + scan-local (baseline-only)
│   ├── scanners/            # pluggable scanner adapters — export run*Scan(url, options) -> { normalized, raw }
│   ├── fixers/               # pluggable, framework-scoped remediation
│   ├── platforms/            # deployment-target adapters (negotiation/headers)
│   └── lib/
│       ├── npx-runner.js     # cross-platform npx invocation (see docs/architecture)
│       └── local-server.js   # build + serve a repo locally for `loop`/`scan-local` (no live deployment)
└── fixtures/
    ├── astro-starlight-cf-pages/   # reference fixture the Astro+Starlight fixer is verified against
    ├── astro-cf-pages/             # reference fixture the plain-Astro fixer is verified against
    └── nextjs-vercel/              # reference fixture the Next.js+Vercel fixer is verified against
```

Every scanner adapter and every fixer is independently pluggable — a scanner going offline or a
framework having no fixer yet degrades to "unsupported," never breaks the pipeline.

Design rationale (site-type filtering, scanner version pinning, rate-limit handling, the
`is-agentic` caching trap, Astro `smartQuotes()` bug) and cross-platform notes (npx resolution,
Windows `.cmd` shims, Node version requirements):
**[docs/architecture](https://dkdev24.github.io/siteready/architecture)**

## Contributing

Adding a scanner adapter or a framework fixer is additive — new files under `scanners/` or
`fixers/`+`platforms/`, no changes to what's already shipped. See `CONTRIBUTING.md` for the
interface contract.

## License

MIT — see `LICENSE`.
