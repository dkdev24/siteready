---
name: siteready
description: >-
  Scan any website for "agent readiness" (can an AI agent actually read and use this site — llms.txt,
  markdown mirrors, structured data, agent-friendly errors, per afdocs and Vercel's Is Agentic
  standards), get one unified scorecard, and — for a local Astro (with or without Starlight) +
  Cloudflare Pages checkout — auto-fix the issues a fixer supports and prove the improvement with a
  before/after diff. Use this whenever the user asks to check, audit, or improve a site's readiness for AI
  agents/crawlers/LLMs, mentions llms.txt, the AFDocs spec, is-agentic.com, "agent-friendly docs,"
  or wants a doc site scored and remediated for AI/agent consumption — even if they just paste a
  URL and ask "how agent-ready is this?" or "can Claude read this site properly?"
---

# siteready

**This skill is a thin adapter over a standalone CLI tool — it contains no logic of its own.**
siteready is runnable code that a human uses directly in a terminal (`siteready
https://example.com`); this file only tells you *which* command to run for a given request and how
to read the result. So: never reimplement a step here by hand, and never work around a missing
capability with your own scripting — if the tool can't do it, say so and point at
`CONTRIBUTING.md`. Anything you can do through this skill, the user can do by typing the same
command themselves, and that's deliberate.

`siteready` is a CLI, not a library. Every step below is written as `node <skill-dir>/src/cli.js
<command> ...`, where `<skill-dir>` is this skill's own base directory (the one you were told when
this skill loaded — siteready's own repo, wherever it's installed). **If a `siteready` binary is
already on PATH** (the user ran `npm install -g siteready` or `npm link`), prefer plain `siteready
<command> ...` instead — it's the same entry point and the same behavior, and it matches what the
user's own docs and terminal history show. Check once with `siteready --help` and fall back to the
`node <skill-dir>/src/cli.js` form if that fails; don't check again per command.

It orchestrates existing scanners and applies existing fixes; it is not itself a scanner.

**Run every command with the target site's own project as your working directory, not from inside
`<skill-dir>`.** siteready is a separate tool from whatever site you're testing — only the `node
.../src/cli.js` invocation itself points into `<skill-dir>`; every path *argument* (a repo checkout
for `enhance`/`loop`, `--out`, `--baseline`) should be relative to the target project (`.` for "the
project I'm already in"), so reports and diffs land next to the site being tested, not buried
inside the siteready installation.

## Decide which commands apply

| The user has... | Run |
|---|---|
| Just a URL, wants a score/report | `scan` only |
| A URL + a local checkout of that site's repo, wants it fixed | `scan` → `enhance` → `rescan` (or just `loop`, see below) |
| Two existing `report.json` files, wants a before/after | `diff-report` directly |
| A local checkout, wants the whole thing done in one shot | `loop` |

**`enhance` needs a local checkout of the target site's own repo — a URL alone is not enough.**
Its fixes are source-file edits (an `llms.txt` endpoint, a Cloudflare Pages Function, a layout
override) — there is no way to write "add `src/pages/llms.txt.ts`" against a URL with no
filesystem to write it into. If the user only gives a URL and asks for fixes, tell them you need
their local checkout (or ask them to point you at it) before running `enhance`. `scan`, `rescan`,
and `diff-report` never need this — they only ever hit the live URL over HTTP.

## Commands

```bash
# scan + report (any public URL — no local repo needed, run from wherever)
node <skill-dir>/src/cli.js https://example.com
node <skill-dir>/src/cli.js https://example.com --out ./out/my-scan --sampling deterministic
node <skill-dir>/src/cli.js https://example.com --scanners is-agentic   # or: afdocs, or both (default)

# enhance a local repo checkout — run with that repo as your cwd, target it as "."
node <skill-dir>/src/cli.js enhance .
node <skill-dir>/src/cli.js enhance . --pr   # open a PR instead of an unstaged diff

# rescan a URL against a prior baseline report (re-runs that baseline's own scanner set)
node <skill-dir>/src/cli.js rescan https://example.com --baseline ./out/example.com-.../report.json

# diff two already-written report.json files directly
node <skill-dir>/src/cli.js diff-report ./out/before/report.json ./out/after/report.json

# full local loop: scan -> enhance -> rescan -> diff-report, no live deployment, no manual steps
node <skill-dir>/src/cli.js loop .
```

Read every command's own output before deciding what to do next — `enhance` prints exactly what it
wrote, skipped (already present, won't overwrite), or warned about, and exits without touching git.
`loop` prints all four steps' output in sequence, ending in a `diff-report.md`.

## What to tell the user afterward

- After `scan`: point them at `report.md` (or just relay the scorecard — score, grade, top failing
  checks with the fix hints the report already includes) rather than re-deriving it yourself.
  **Check the checks' messages before reporting a score as genuine** — if most of them say
  something like "failed to fetch" rather than describing actual page content, the target didn't
  resolve/respond at all (typo'd domain, site down, localhost-only). Report that as "couldn't reach
  the site" instead of presenting the resulting low score as a real agent-readiness finding.
- After `enhance`: **it only ever leaves an unstaged diff or opens a PR — it never commits.** Tell
  the user to review the diff themselves (`git diff` in the target repo) before committing. If they
  asked for `--pr` and it fell back to an unstaged diff, that means no git remote or no
  authenticated `gh` was found — say so plainly rather than treating it as a silent success.
  Never `git add`/`commit`/`push` in the target repo on the user's behalf just because `enhance`
  ran — that decision is theirs.
- After `loop`/`diff-report`: lead with the score delta and the "Fixed" / "Still failing" /
  "Regressed" breakdown from `diff-report.md`, not just the raw JSON.
- **If a `rescan`/`loop` shows zero movement on `is-agentic` for a check you know was fixed and
  deployed, don't report it as "the fix didn't work."** `is-agentic` is a hosted third-party scanner
  that caches results per domain server-side with no forced-refresh lever from this CLI — it can
  return the identical cached result (same `scanned_at`) even after a confirmed-live deploy. Verify
  the live site directly first (`curl` the page/route, grep for the expected content) — if it's
  genuinely live, tell the user the scanner result is stale/cached, not that the fix regressed or
  failed, and that a manual rescan on is-agentic.com's own page may be needed to see it move.
  `afdocs` re-crawls live on every call and doesn't have this problem.

## Supported fixer today

**Astro + Starlight + Cloudflare Pages**, and **plain Astro (no Starlight) + Cloudflare Pages**,
have auto-fixers (see `README.md` "Status"). The plain-Astro fixer is intentionally narrower — no
`docs` collection or component-override convention to build on means it can't safely generate a
content-aware `llms.txt` or `.md` mirror routes without guessing the site's own routing (a wrong
guess produces broken links). It covers what's safe for any Astro site regardless of content shape:
a real `404.astro`, a permissive `robots.txt`, and — only if the repo already has a hand-rolled
markdown-mirror route — a `smartQuotes()` typography util plus a warning to wire it in (see
README's "Design notes" for the smartypants/markdown-parity gotcha this exists for). If
`detect-stack` / `enhance` reports the target framework or platform as unsupported, say so
directly — don't try to hand-write the equivalent fix yourself outside the tool; that's exactly the
kind of one-off `enhance` is meant to replace. Point the user at `CONTRIBUTING.md` if they want to
add a new scanner adapter or fixer themselves.

## More detail

- `README.md` — full architecture, design notes, cross-platform notes, the exact output layout
  (`report.md`/`report.json`/`raw/*.json`/`diff-report.*`) under `./out/<target>-<timestamp>/`.
- `CONTRIBUTING.md` — the scanner-adapter and fixer/platform interface contract, if extending
  siteready itself rather than just running it.
- `AGENTS.md` — standing development rules for anyone editing siteready's own source.
