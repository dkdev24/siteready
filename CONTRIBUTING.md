# Contributing to siteready

Both scanner adapters and framework/platform fixers are additive plugins — adding one means new
files, never changes to what's already shipped. This doc is the interface contract each has to
follow; see `docs/architecture.md` for the overall architecture.

## Adding a scanner adapter

A scanner adapter lives at `src/scanners/<name>.js` and exports one function:

```js
export async function run<Name>Scan(url, options) {
  // ...
  return { normalized, raw };
}
```

- `url` is the target to scan; validate it's `http:`/`https:` before doing anything else.
- Invoke the scanner's CLI **through `src/lib/npx-runner.js`'s `runNpxCli(packageSpec, args)`**,
  never a direct `child_process` call — it handles cross-platform `npx` resolution and treats a
  scanned site's own failing checks (non-zero exit) as the expected case, not a tool failure.
- Pin `packageSpec` to an exact version (`your-scanner@1.2.3`), not a bare package name — see
  `scanners/afdocs.js` for why.
- `raw` is the scanner's own unmodified JSON output, for debugging.
- `normalized` must match the shape every other scanner produces, so `report.js` and
  `diff-report.js` need no scanner-specific branching:

  ```js
  {
    scanner: "your-scanner",
    target: url,
    scannedAt: "<ISO timestamp>",
    score: { overall: 0-100, grade: "A"|"B"|"C"|"D"|"F" } | null,
    categoryScores: { "<category>": { score, grade }, ... },
    summary: { total, pass, warn, fail, skip, error },
    checks: [
      { id, category, status: "pass"|"warn"|"fail"|"skip"|"error", message, fix: string|null },
      ...
    ],
  }
  ```

- Register it in `SUPPORTED_SCANNERS` in `src/scan.js`.
- Web-only scanners with no CLI/API are out of scope for auto-run — never scrape a scanner UI as a
  first resort; keep those manual/optional and documented as such.

## Adding a framework fixer or platform module

The fix set splits along two axes:

- **Framework** (`src/fixers/<framework>.js`) — content-generation-side fixes: an `llms.txt`
  endpoint, `.md` mirror routes, a body-level directive, robots.txt rules. Exports
  `apply<Framework>Fixes(repoPath)` returning `{ written, skipped, warnings }`.
- **Platform** (`src/platforms/<platform>.js`) — serving-side fixes: content-negotiation
  headers/Functions, cache/`Last-Modified` config. Exports `apply<Platform>Fixes(repoPath)`
  returning the same `{ written, skipped, warnings }` shape.

Rules both must follow:

- **Skip a file rather than overwrite it** if the target already has one — return it under
  `skipped` with a reason, never clobber a site's own customization.
- **Never touch git** — no `add`/`commit`/`push`. Only write to the working tree. `enhance.js` and
  the CLI are what surface the diff (or, opt-in, open a PR) — a fixer itself must never decide to
  commit.
- Degrade to a clear warning, not a thrown error, when a precondition is missing (e.g. no
  `astro.config.*` found) — one unsupported fixer must never break the rest of the pipeline.

Register the new framework/platform pair in `src/detect-stack.js` (how to recognize it from a
local checkout's `package.json` + config files) and wire it into `src/enhance.js`.

## Adding an agent skill installer

`siteready install-skill <agent>` writes the package's own `SKILL.md` into an agent tool's
skill-discovery path. An installer lives at `src/installers/<agent>.js` (or is shared by several
agent ids, like `agents-skill.js` for codex/opencode) and exports:

```js
export async function install<Agent>Skill({ packageRoot, skillMd, global, force, uninstall }) {
  // ...
  return { written: [], skipped: [], removed: [], warnings: [] };
}
```

- Same shape as a fixer's return value, plus `removed` for `--uninstall`.
- **Skip and warn, don't overwrite**, unless `force` is set — same rule as fixers.
- If the target agent doesn't document a runtime "here's your own base directory" signal the way
  Claude Code does, bake `packageRoot` into the copy in place of the literal `<skill-dir>`
  placeholder (see `agents-skill.js`) instead of leaving it for the agent to resolve at load time.
- Register the new agent id in `INSTALLERS` in `src/skill-install.js` and add it to
  `SUPPORTED_AGENTS`.

## Testing your addition

- `node src/cli.js <your-target-url>` for a scanner adapter.
- For a fixer: apply it to a small real project of the matching framework/platform, `git diff` the
  result, confirm a second `enhance` run is a no-op (everything skipped, nothing rewritten).
- If you can build a local, from-scratch fixture for it (see `fixtures/`), `node src/cli.js loop
  <path-to-fixture>` is the fastest way to prove the whole scan→enhance→rescan→diff-report cycle
  end-to-end without deploying anywhere.

## Reporting issues

Use the "new scanner adapter" or "new framework fixer" issue templates to scope a feature request
— they ask for exactly what a maintainer needs to review a PR against this contract.
