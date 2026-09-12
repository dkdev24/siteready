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
for `enhance`/`scan-local`/`rescan-local`, `--out`, `--baseline`) should be relative to the target
project (`.` for "the project I'm already in"), so reports and diffs land next to the site being
tested, not buried inside the siteready installation.

## Decide which commands apply

| The user has... | Run |
|---|---|
| Just a URL, wants a score/report | `scan` only |
| A URL + a local checkout of that site's repo, wants it fixed | `scan` → `enhance` → `rescan` |
| A local checkout not deployed anywhere yet, wants it scored and fixed | `scan-local` → `enhance` → `rescan-local` |
| Two existing `report.json` files, wants a before/after | `diff-report` directly |
| Multiple URLs, wants them scored side by side | `compare` |
| One URL, wants to know if it's trending up or down | `monitor` (reads past scans, no new scan) |

**Run `scan-local`/`enhance`/`rescan-local` as three separate commands, reporting each result back
to the user before the next — never script all three in one shot.** There used to be a single `loop`
command that chained them automatically; it was removed so the user sees and can act on each step's
own output (the `enhance` diff, in particular, is worth a look before re-scanning) — not because of
any tunnel-spacing concern (an earlier theory that back-to-back tunnels were unreliable turned out
to be wrong; see the tunnel note below).

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
node <skill-dir>/src/cli.js https://example.com --site-type content   # a docs/content site with no public API

# enhance a local repo checkout — run with that repo as your cwd, target it as "."
node <skill-dir>/src/cli.js enhance .
node <skill-dir>/src/cli.js enhance . --pr   # open a PR instead of an unstaged diff

# rescan a URL against a prior baseline report (re-runs that baseline's own scanner set)
node <skill-dir>/src/cli.js rescan https://example.com --baseline ./out/example.com-.../report.json

# diff two already-written report.json files directly
node <skill-dir>/src/cli.js diff-report ./out/before/report.json ./out/after/report.json

# local baseline scan — no live deployment, for a site not deployed anywhere yet; run with the
# repo as your cwd, target it as "."
node <skill-dir>/src/cli.js scan-local .

# local re-scan + diff vs the scan-local baseline above — run as its own step, after enhance,
# so the enhance diff gets reviewed before re-scanning (see the tunnel note below)
node <skill-dir>/src/cli.js rescan-local . --baseline ./out/.../report.json

# scan multiple URLs and render them side by side (scanned one at a time — see Ora rate-limit note)
node <skill-dir>/src/cli.js compare https://example.com https://a-competitor.com

# score-over-time for one URL from its past scan/rescan runs under ./out — no new scan
node <skill-dir>/src/cli.js monitor https://example.com
```

**If the user's site is a pure content/docs site with no public API and `is-agentic`/Ora's score
looks lower than the site deserves**, check whether the failing checks are API-surface ones
(`openapi-spec`, `oauth-support`, anything in the Payments layer, etc.) — if so, tell them about
`--site-type content`, which excludes those from scoring instead of penalizing a site for an API it
was never going to have. Don't apply it silently on their behalf; ask first, since it changes the
score's meaning.

Read every command's own output before deciding what to do next — `enhance` prints exactly what it
wrote, skipped (already present, won't overwrite), or warned about, and exits without touching git.
`scan-local`/`rescan-local` default to afdocs; adding `--scanners is-agentic,ora` works too, but
each scan then routes through an ephemeral Cloudflare Quick Tunnel (those scanners crawl from their
own infrastructure and can't reach `localhost`), which adds up to ~60-90s per scan and can fail
outright on a bad network. Quick Tunnels are anonymous, best-effort, and each gets its own random
hostname with its own independent DNS-propagation delay — sometimes a few seconds, sometimes over a
minute, with no relationship to how recently another tunnel was created. A failed attempt (whether
`cloudflared` exiting or the hostname not becoming reachable in time) is retried automatically with
a fresh tunnel, up to `SITEREADY_TUNNEL_ATTEMPTS` (default 3). **If every attempt fails**, don't
loop retries yourself — tell the user it's Cloudflare's Quick Tunnel infra being unreliable this
time and suggest re-running, or scanning a deployed URL directly instead.

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
- After `rescan-local`/`diff-report`: lead with the score delta and the "Fixed" / "Still failing" /
  "Regressed" breakdown from `diff-report.md`, not just the raw JSON.
- **If a `rescan`/`rescan-local` shows zero movement on `is-agentic` for a check you know was fixed and
  deployed, don't report it as "the fix didn't work."** `is-agentic` is a hosted third-party scanner
  that caches results per domain server-side with no forced-refresh lever from this CLI — it can
  return the identical cached result (same `scanned_at`) even after a confirmed-live deploy. Verify
  the live site directly first (`curl` the page/route, grep for the expected content) — if it's
  genuinely live, tell the user the scanner result is stale/cached, not that the fix regressed or
  failed, and that a manual rescan on is-agentic.com's own page may be needed to see it move.
- **If `ora` fails with an HTTP 429, that's its rate limit, not a broken scan — don't retry in a
  loop.** Ora's public API is keyless but capped per IP: 10 scans/minute burst and 30 per rolling
  24h ([ora.ai/docs](https://ora.ai/docs)). The error names the quotas and echoes Ora's
  `Retry-After`; relay that wait to the user instead of re-running. Cache hits don't consume quota,
  so re-scanning one URL is usually free — it's scanning many *distinct* URLs in a session (or a
  multi-URL sweep) that exhausts the daily budget. Budget accordingly before fanning out. A scanner
  failure no longer aborts the whole scan: `report.json` is still written with the other scanners'
  results, the failed scanner recorded as `{ error }` and top-level `partial: true`, and the CLI
  prints a warning naming which scanner failed. Tell the user which scanner failed and that its
  checks are excluded from this report's score, and re-run just that scanner later (or after the
  wait) if a complete report is needed.
  `afdocs` re-crawls live on every call and doesn't have this problem.

## Supported fixer today

**Astro + Starlight + Cloudflare Pages**, **plain Astro (no Starlight) + Cloudflare Pages**, and
**Next.js (App Router) + Vercel** have auto-fixers (see `README.md` "Status"). The plain-Astro
fixer is intentionally narrower — no `docs` collection or component-override convention to build on
means it can't safely generate a content-aware `llms.txt` or `.md` mirror routes without guessing
the site's own routing (a wrong guess produces broken links). It covers what's safe for any Astro
site regardless of content shape: a real `404.astro`, a permissive `robots.txt`, and — only if the
repo already has a hand-rolled markdown-mirror route — a `smartQuotes()` typography util plus a
warning to wire it in (see docs/architecture.md for the smartypants/markdown-parity gotcha this
exists for). The Next.js + Vercel fixer is similarly scoped smaller than the Starlight one — see
docs/install for the fixer-by-fixer rationale. If `detect-stack` / `enhance` reports the target
framework or platform as unsupported, say so directly — don't try to hand-write the equivalent fix
yourself outside the tool; that's exactly the kind of one-off `enhance` is meant to replace. Point
the user at `CONTRIBUTING.md` if they want to add a new scanner adapter or fixer themselves.

## More detail

- `docs/architecture.md` — full architecture, design notes, cross-platform notes.
- `docs/cli-reference.md` — every command/flag, the exact output layout
  (`report.md`/`report.json`/`raw/*.json`/`diff-report.*`) under `./out/<target>-<timestamp>/`.
- `CONTRIBUTING.md` — the scanner-adapter and fixer/platform interface contract, if extending
  siteready itself rather than just running it.
- `AGENTS.md` — standing development rules for anyone editing siteready's own source.
