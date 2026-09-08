---
name: New scanner adapter
about: Propose or track adding a new agent-readiness scanner adapter
title: "Scanner adapter: <name>"
labels: scanner-adapter
---

## Scanner

- Name / URL:
- CLI or API available? (link to docs)
- License / ToS constraints, if any:

## Why this scanner

What does it check that afdocs and Is Agentic don't already cover? (Avoid adding a scanner that's
just a second implementation of a spec another scanner already covers — see `README.md`'s note on
why Fern Agent Score was left out.)

## Integration plan

- [ ] CLI/API confirmed scriptable (no headless browser needed)
- [ ] JSON output schema documented here (paste a sample)
- [ ] Exit-code behavior on a failing scan confirmed (must not be treated as a tool failure)
- [ ] Adapter follows the contract in `CONTRIBUTING.md` (`run<Name>Scan(url, options)` ->
      `{ normalized, raw }`, pinned package version, invoked through `lib/npx-runner.js`)
