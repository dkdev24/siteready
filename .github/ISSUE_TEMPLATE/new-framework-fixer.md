---
name: New framework fixer
about: Propose or track adding a new framework or platform fixer
title: "Fixer: <framework> + <platform>"
labels: fixer
---

## Framework / platform

- Framework:
- Platform (where it's served — this determines the negotiation/headers fix):
- Detection signal (how `detect-stack.js` should recognize this pair from a local checkout):

## Fix set

Which of the standard fixes apply, and how do they map onto this framework/platform's own APIs?

| Fix | Applies? | Framework/platform hook |
|---|---|---|
| `llms.txt` generation | | |
| `.md` mirror routes | | |
| Body-level llms.txt directive | | |
| Content-Signal / AI robots.txt rules | | |
| `Accept: text/markdown` negotiation | | |
| Sitemap freshness | | |
| `Last-Modified` headers | | |

## Reference fixture

Do you have (or can you build) a minimal, from-scratch project for this framework/platform to
develop and verify the fixer against — similar to `fixtures/astro-starlight-cf-pages/`? A fixer
without a fixture to prove a real before/after score improvement won't be merged.

## Checklist

- [ ] Fixer follows the contract in `CONTRIBUTING.md` (skip-don't-overwrite, never touches git,
      degrades to a warning on missing preconditions)
- [ ] Verified end-to-end on the reference fixture — before/after score improvement documented
- [ ] Registered in `detect-stack.js` and `enhance.js`
