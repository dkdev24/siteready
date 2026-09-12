---
title: siteready
---

# siteready

Scan a website with multiple agent-readiness scanners, get one unified scorecard, auto-fix the
issues a fixer supports for your framework/platform, then re-scan and get a before/after diff.
All from the CLI. No browser automation, no scanner UI scraping.

Not a new scanner. It's an **orchestration + remediation layer** on top of existing scanners
([afdocs](https://agentdocsspec.com/), [Is Agentic](https://is-agentic.com/) / [Ora](https://ora.ai/)),
because no single scanner covers the whole "can an AI agent actually use this site" standard, and
none of them auto-fix anything.

siteready doesn't just advise. It ships the fix and proves it worked. Scores come from the
standards' own scanners, not from a model grading itself. Fixes are real code, applied
idempotently and verified cross-platform in CI. A local scan-local → enhance → rescan-local cycle
shows you the before/after diff before anything deploys.

**Real numbers:** the Astro+Starlight+Cloudflare-Pages fixer takes a fresh Starlight site from
**0/100 (F) → 97/100 (A)** on afdocs, fully reproducible with no deployment required.

## Quickstart

```bash
npm install -g siteready
siteready https://example.com
```

or without installing:

```bash
npx siteready https://example.com
```

Needs Node ≥18. No API keys, no accounts. The default scanners are invoked via `npx` on demand.

```
1. Scan:    run the site through multiple agent-readiness scanners
2. Report:  normalize results into one scorecard (score, grade, failing/warning checks, evidence)
3. Enhance: detect the site's framework/host, apply matching fixes as a diff (or a PR)
4. Re-scan: run the same scanners again, diff against baseline, produce a before/after report
```

## Docs

- [Install](install): every install path (global, npx, source checkout, Claude Code skill)
- [CLI reference](cli-reference): every command, its options, and what it writes to disk
- [Why siteready](why): vs. calling scanners directly, vs. GEO/prompt-based audit skills
- [Architecture](architecture): directory layout, design notes, cross-platform notes
- [Contributing](contributing): adding a scanner or a framework fixer

## What this is: a tool, not a skill

siteready is a **runnable CLI**, real code with a real binary, a pinned scanner contract, and CI.
It has two front doors onto the same engine, and neither is privileged: the `siteready` binary for
humans, `SKILL.md` for agents. `SKILL.md` never implements behavior. It's a thin adapter that
shells out to the same CLI a human would use.

[GitHub repo](https://github.com/dkdev24/siteready), [npm package](https://www.npmjs.com/package/siteready), MIT license
