---
name: siteready
description: >-
  Scan any website for "agent readiness" (can an AI agent actually read and use this site — llms.txt,
  markdown mirrors, structured data, agent-friendly errors, per afdocs and Vercel's Is Agentic
  standards), get one unified scorecard, and — for a local Astro + Starlight + Cloudflare Pages
  checkout — auto-fix the issues a fixer supports and prove the improvement with a before/after
  diff. Use this whenever the user asks to check, audit, or improve a site's readiness for AI
  agents/crawlers/LLMs, mentions llms.txt, the AFDocs spec, is-agentic.com, "agent-friendly docs,"
  or wants a doc site scored and remediated for AI/agent consumption — even if they just paste a
  URL and ask "how agent-ready is this?" or "can Claude read this site properly?"
---

# siteready

`siteready` is a CLI, not a library — every step below is `node src/cli.js <command> ...` run from
this repo. It orchestrates existing scanners and applies existing fixes; it is not itself a scanner.

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
# scan + report (any public URL — no local repo needed)
node src/cli.js https://example.com
node src/cli.js https://example.com --out ./out/my-scan --sampling deterministic
node src/cli.js https://example.com --scanners is-agentic   # or: afdocs, or both (default)

# enhance a local repo checkout — requires the actual repo on disk, see above
node src/cli.js enhance ../my-astro-starlight-site
node src/cli.js enhance ../my-astro-starlight-site --pr   # open a PR instead of an unstaged diff

# rescan a URL against a prior baseline report (re-runs that baseline's own scanner set)
node src/cli.js rescan https://example.com --baseline ./out/example.com-.../report.json

# diff two already-written report.json files directly
node src/cli.js diff-report ./out/before/report.json ./out/after/report.json

# full local loop: scan -> enhance -> rescan -> diff-report, no live deployment, no manual steps
node src/cli.js loop ../my-astro-starlight-site
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

## Supported fixer today

Only **Astro + Starlight + Cloudflare Pages** has an auto-fixer right now (see `README.md` "Status:
v1.0"). If `detect-stack` / `enhance` reports the target framework or platform as unsupported, say
so directly — don't try to hand-write the equivalent fix yourself outside the tool; that's exactly
the kind of one-off `enhance` is meant to replace. Point the user at `CONTRIBUTING.md` if they want
to add a new scanner adapter or fixer themselves.

## More detail

- `README.md` — full architecture, design notes, cross-platform notes, the exact output layout
  (`report.md`/`report.json`/`raw/*.json`/`diff-report.*`) under `./out/<target>-<timestamp>/`.
- `CONTRIBUTING.md` — the scanner-adapter and fixer/platform interface contract, if extending
  siteready itself rather than just running it.
- `AGENTS.md` — standing development rules for anyone editing siteready's own source.
