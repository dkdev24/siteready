---
title: FAQ
---

[← Back to index](index)

# FAQ

**What does the siteready score mean?** The score is a normalized 0–100 from
third-party agent-readiness scanners ([afdocs](https://agentdocsspec.com/), [Is
Agentic](https://is-agentic.com/), and optionally [Ora](https://ora.ai/)) — not from a model
grading itself. Same URL, same scanners, same score: anyone can re-run it, and it's citable to a
client or a reviewer.

**Why not just call the scanners directly?** You can, and for the scan layer that's mostly a
convenience difference — one scorecard instead of three JSON shapes. The real value is the
fixers: turning a scanner's one-line `fix` suggestion into working, idempotent,
cross-platform-verified code. Plus the scan → enhance → rescan → diff-report cycle, which proves
a fix worked locally before anything deploys. See [Why siteready](why) for the honest version of
this argument, including where the tool adds nothing.

**How is siteready different from GEO skill packs?** GEO skill packs are prompt-driven advisors
for AI *visibility*: model-graded scores and recommendation templates. siteready is a build tool
for AI *usability*: reproducible third-party scores, fixes as real code, and a local
verify-before-deploy loop. Different question, different standard — see [Why
siteready](why#how-this-differs-from-geo--prompt-based-audit-skills).

**Is siteready free? Can I use it commercially?** Yes. siteready is [MIT
licensed](https://github.com/dkdev24/siteready), free to use including commercially. The
default scanners need no API keys and no accounts.

**Which frameworks and platforms does the fixer support?** Astro (with or without Starlight)
on Cloudflare Pages, Netlify, or GitLab Pages; Next.js (App Router) on Vercel, Netlify, or AWS
(CloudFront + OpenNext), including monorepos; SvelteKit (adapter-static) on Cloudflare Pages;
Jekyll on GitHub Pages or GitLab Pages. Anything else and `enhance` reports `unsupported` —
that's the honest scope limit, and fixer/platform coverage is the roadmap. See
[Install](install) for the current table.

**What Node.js version do I need?** Node.js 22 or newer.

**Does siteready deploy anything to my site?** No. `enhance` writes fixes to your working tree
as an unstaged diff (or opens a PR with `--pr`). It never commits, pushes, or deploys on its
own, and it never overwrites a file you already have. The rescan step runs locally too, so you
see the before/after diff before anything ships.

**What data does siteready collect?** The CLI runs entirely on your own machine. The
documentation website uses Google Analytics 4 behind a consent banner — if you decline, no
analytics tag loads and no analytics cookies are set. Details are on the [Privacy](privacy)
page.
