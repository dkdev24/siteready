---
title: Install
---

[← Back to index](index)

# Install

```bash
# as a tool, globally
npm install -g siteready
siteready https://example.com

# or without installing
npx siteready https://example.com

# from a source checkout (contributors, or to use it as a Claude Code skill)
git clone https://github.com/dkdev24/siteready.git
cd siteready && npm link      # puts `siteready` on your PATH
```

Needs Node ≥18. No API keys and no accounts for the default scanners — they're invoked via `npx`
on demand.

From a source checkout without `npm link`/`npm install -g`, every command works the same with
`node src/cli.js` in place of `siteready` (`node src/cli.js https://example.com`, etc.) — the
binary is just a shim over that entry point.

## Using it as a Claude Code skill

Point Claude Code at a checkout containing `SKILL.md`; the skill invokes the same CLI you'd run by
hand — see the [README](https://github.com/dkdev24/siteready#readme) for the tool-vs-skill design.

## Status

| Piece | Status |
|---|---|
| Scanners | [afdocs](https://agentdocsspec.com/) (doc-heavy sites), [Vercel Is Agentic](https://is-agentic.com/) (any content site) — both run by default. [Ora](https://ora.ai/) (the engine behind Is Agentic) is opt-in (`--scanners ora`) |
| Fixer | Astro + Starlight + Cloudflare Pages, plain Astro (no Starlight) + Cloudflare Pages, Next.js (App Router) + Vercel |
| Loop | `scan → enhance → rescan → diff-report`, fully local (no live deployment needed) |
| CI | Windows, macOS, and Linux, on every push |
| Other frameworks/platforms | Not yet — additive, by demand (see [Contributing](contributing)) |
