---
title: Why siteready
---

[← Back to index](index)

# Why use this, instead of pointing an agent at the scanners directly?

Every scanner here already returns a `fix`/`recommendation` string on each failing check, so an
agent with repo access could, in principle, call `afdocs`/`is-agentic`/Ora directly and act on that
text itself, no siteready in the loop. Worth asking honestly where that leaves this tool, because
the answer isn't the same for every layer of it.

**The scan/report layer is genuinely weaker in an agent-native world.** Normalizing three scanners'
different JSON shapes into one scorecard is mostly a *human-readability* win (`report.md`, a
diffable schema). An agent doesn't care that afdocs and is-agentic disagree on field names, so it
can just read both raw outputs and act on each `fix` field. If your only user is an agent, not a
person reading a report, this part of siteready is convenience, not unique capability.

**The fixers are where the real value is, and it isn't close.** A scanner's `fix` field is a
one-line suggestion, something like "add an llms.txt directive" or "serve markdown on `.md` URLs." Turning that into
working code is where the actual difficulty lives, and this project's own history is the evidence.
`fixers/astro.js`'s `smartQuotes()` exists because Astro's default `remark-smartypants` curls
quotes on rendered HTML only, silently failing afdocs' `markdown-content-parity` check on 43–49% of
a real site's blog posts. A plausible-looking hand fix would have missed that entirely. Add the
false-positive `.md.ts`-detection heuristic that had to be corrected once, the CRLF-vs-`\n`
fixture-stripping bug caught by Windows CI, `taskkill /t` for orphaned `wrangler` processes,
`is-agentic`'s server-side caching trap (a confirmed-live fix can rescan as unchanged), and Ora's
`url` field being a report-page link rather than the scanned site (see `scanners/ora.js`). An agent
improvising a fix from a scanner's one-sentence suggestion has to rediscover every one of those the
hard way, against a real site, in production. siteready's fixers are that already-paid-for cost,
applied idempotently (skip what already exists, never overwrite) and verified cross-platform in CI.

**The loop is the other asset an ad hoc fix session doesn't have.** `scan → enhance → rescan →
diff-report` proves a fix worked locally, before anything ships, with no live deployment needed
(`fixtures/*/README.md` reproduce real before/after numbers this way). An agent applying
suggestions by hand has no equivalent. It has to deploy live and diff two scans itself, and it
won't know about `is-agentic`'s caching trap above unless it's already been burned by it once.

**This argument fully favors "just use an agent directly" outside the framework/platform combos a
fixer covers.** Today that's Astro (with or without Starlight) on Cloudflare Pages, Netlify, or
GitLab Pages; Next.js (App Router) on Vercel or Netlify; and Jekyll on GitHub Pages or GitLab
Pages. Anything else and `enhance` reports `unsupported`, and siteready
really is just a nicer wrapper around scanner output for that site. That's the honest scope limit,
and it's also the roadmap. This tool's value scales with fixer/platform coverage (see
[Contributing](contributing)), not with scanner count. `ora` was deliberately made opt-in rather
than a fourth default scanner for exactly this reason (see [Architecture](architecture)).

## How this differs from GEO / prompt-based audit skills

There's a growing category of GEO ("Generative Engine Optimization") skill packs, like
[Cognitic-Labs/geoskills](https://github.com/Cognitic-Labs/geoskills), a suite of prompt skills
(`geo-audit`, `geo-fix-content`, `geo-fix-schema`, `geo-fix-llmstxt`, `geo-compare`,
`geo-monitor`) that score a URL and emit recommendations and templates. They overlap with
siteready enough to be worth an explicit comparison, but they're aimed at a different question.

**The short version: a GEO skill pack is a prompt-driven advisor for AI *visibility*.** siteready
is a build tool for AI *usability*. Four concrete consequences:

1. **Third-party scores, not self-graded ones.** A prompt-based audit's 0–100 comes from the model
   doing the judging, not reproducible run-to-run, not auditable, and no external party stands
   behind it. siteready's numbers come from afdocs / Is Agentic / Ora. Same URL, same score,
   anyone can re-run it, and it's citable to a client or a reviewer. "The standard's own scanner
   says 97/100" is a different claim than "an AI told us we're a 72."
2. **Fixes are code, not templates.** A `fix` skill that emits suggested markup still leaves a
   human or agent to make it actually work. The `smartQuotes()` case above is the standing proof
   that this gap is real, not cosmetic. A plausible-looking hand fix silently fails afdocs'
   `markdown-content-parity` on 43–49% of a real site's posts because of Astro's default
   `remark-smartypants`, and no amount of prompting surfaces that. siteready's fixers are that
   cost already paid, idempotent and never overwriting an existing file, verified on
   Windows/macOS/Linux in CI.
3. `scan → enhance → rescan → diff-report` is a falsification step. It proves a fix worked
   locally, before deployment, with a per-check fixed / regressed / still-failing breakdown. A
   recommendation engine has no equivalent. It hands over advice and exits, which is the piece an
   advisory tool can't add without becoming a build tool.
4. **GEO measures agent citation. Agent-readiness measures agent action, a different and wider
   standard.** GEO asks "will an LLM mention me." Agent-readiness asks "can an agent complete a
   task here." That's content
   negotiation, `.md` mirror routes, controlled interaction, and on Ora's full ranker a payments
   layer, ARD catalog, and A2A agent cards. The second question is the one that agentic commerce
   actually turns on. siteready is pointed at it deliberately, which is why the docs here say
   "agent-readiness" and never "GEO."

**A URL-only GEO pack still wins today on coverage and breadth.** It runs against any site, while
`enhance` reports `unsupported` outside the framework/platform pairs listed above. That's the same
honest scope limit as the section above, and the reason fixer/platform
coverage is the roadmap. A GEO pack also ships competitor comparison and score-over-time tracking.
siteready has both too now, as the `compare` and `monitor` commands (see
[CLI reference](cli-reference)).
