# NEXT_ACTIONS.md

Open TODOs. Numbers are stable IDs (referenced from WORKLOG.md/ISSUES.md/
HANDOFF.md, which are append-only) — don't renumber on reorder. Update at the
end of a session that changes the list (closes an item, adds one, reorders
priority, or condenses a resolved entry). Replace this file's contents (not
append-only, unlike WORKLOG.md).

---

## Open, priority order

2. Real-deploy score-movement verification, still open after the 2026-09-09
   run against `danielkimdev.com`: it scored 94/98 pre-fix with
   `http-status-codes`/`content-negotiation` already passing, so the fix
   didn't flip anything. Need a genuinely fixer-naive Astro site to see an
   actual delta. **Folds in #7's residual**: once re-run, add the Ora scanner
   to this same real-deploy verification instead of CI (Ora has no CI/fixture
   coverage — rate limits (10/min, 30/day) plus anonymous tunnel flakiness
   make it a bad CI citizen; `verify-loop.js` stays afdocs-only deliberately).

9. Confirm `.github/workflows/scanner-version-check.yml` actually fires and
   behaves once merged to `main` — YAML structure and the `GITHUB_OUTPUT`/
   `behind` signal were validated locally, but the scheduled trigger, label
   auto-creation, and dedupe-by-label search were never exercised against a
   real Actions run. Trigger once manually via `workflow_dispatch` after
   merge and check the result. Quick, not started.

8. Confirm `ora.js`'s per-check `id`s are stable across the `format=audit`
   schema version Ora's docs mention — built off the OpenAPI spec + docs
   prose, no pinned version number to check against (Ora is API-only).
   **Partial data point, 2026-09-10:** `ora.ai/api/checks` reports 184
   checks, not the "127 checks" `ora.js`'s top-of-file comment claims, same
   four layers (discovery, access, usability, payments). Count is stale;
   response shape (`{id, name, tier}` per check under layer headings) wasn't
   cross-checked against what `normalize()` parses from a live scan. Worth a
   periodic re-check against `openapi.json` if `normalize()` starts producing
   unexpected nulls.

4. Decide/document a policy for `org-schema-completeness` (`contactPoint`,
   `address`) and `trust-anchors` on doc subdomains that intentionally defer
   identity/legal pages to a separate corporate domain — right now these sit
   as permanent backlog with no way to mark them N/A.

15. **Partial-scan report support** — a single failing scanner (most likely
    Ora hitting a 429) currently aborts the whole scan and writes no
    `report.json`, discarding scanners that already succeeded. Documented
    as-is in `--help`/`SKILL.md` for now rather than patched, because the
    real fix touches the orchestrator's contract: `report.json`/`report.md`
    need a per-scanner `error` state, `buildReport()` needs to score a
    partial set and say so, and `diff-report` needs to refuse comparing a
    baseline against a re-scan missing a scanner rather than reporting a
    phantom regression. Deliberate design change, not started (note: earlier
    revisions of this file mislabeled this item "DONE" for the *documenting*
    of the gap — the actual fix below is what's open).

5. Test the installed skill against another unrelated real website project
   to broaden dogfood coverage.

6. Add fixers for additional frameworks/platforms as demand comes in (see
   CONTRIBUTING.md for the fixer contribution process). Ongoing/ambient, no
   fixed priority.

19. `is-agentic`'s `content-no-js`/`json-ld`/`metadata-completeness`/
    `org-schema-completeness`/`bot-detection` all report "Could not fetch
    homepage" against `https://dkdev24.github.io/siteready/`, unchanged
    before and after the Jekyll fixer (#18) — confirmed 2026-09-11 this isn't
    a real fetch problem (plain `fetch()` gets a clean `200 text/html`, and
    `{% seo %}` is confirmed rendering JSON-LD/canonical/og:type in the raw
    HTML). Scanner-side issue, folds into #2's "need a genuinely fixer-naive
    site" theme — worth a minimal repro (single flag, single UA) next time
    #2 is picked up, not investigated further this session.

---

## Resolved (condensed — see WORKLOG.md for full history)

0. Tunnel flakiness in `loop`'s Cloudflare Quick Tunnel support — **resolved
   2026-09-09**, retry-per-attempt shipped in v1.4.0, verified live. Residual
   risk only (anonymous tunnels can still exhaust retries on a bad network
   day; error message points at `SITEREADY_TUNNEL_ATTEMPTS`), not an action.

1. `fixtures/astro-cf-pages/` synthetic fixture — done.

3. `llms.txt` "when to use this" section — decided: not a generic fixer
   candidate (needs product-specific prose), stays manual guidance.

7. Ora scanner added as third scanner adapter — done. CI/fixture coverage
   folded into #2 above (Ora is a bad CI citizen — rate limits + tunnel
   flakiness).

10. Site-type filtering (`--site-type content|api|application|auto`) — **done
    v1.7.0**. Ships as a conservative subset (Payments layer + named checks),
    not full 184-check classification — see `src/site-types.js` header.

11. **Internal identifiers in public repo's git history** — resolved
    2026-09-09, Daniel's call: accepted as-is, no history rewrite (mildly-
    sensitive employer context, not credentials; force-push wouldn't reach
    existing forks/clones anyway). Working tree is sanitized going forward
    (rule in AGENTS.md); WORKLOG.md's own historical mentions stay untouched
    per its append-only contract. Kept here so this isn't re-litigated or
    "helpfully" purged.

12. First npm publish — **done 2026-09-10**, `siteready@1.7.0` live on the
    public registry under `danielkimdev`. Verified via `npx --yes
    siteready@1.7.0 --help` from outside the repo. See WORKLOG.md.

13. Next.js + Vercel fixer coverage — **done v1.5.0**, verified end-to-end via
    `verify-loop.js` against `fixtures/nextjs-vercel`.

14. Multi-site `compare` + score-over-time `monitor` commands — **done
    v1.6.0**.

18. **Jekyll + GitHub Pages fixer** — **done 2026-09-11 (v1.11.0), verified
    live**. New `framework=jekyll` fixer (`src/fixers/jekyll.js`) + fix-less
    `platform=github-pages` fixer (`src/platforms/github-pages.js`,
    static-only host, warns `markdown-negotiation-vary`/`content-negotiation`
    can't be fixed there — no server-side Accept-header branching at all,
    Actions-build or not); `detect-stack.js` now finds `_config.yml` at the
    repo root or `/docs` independent of `package.json` (a Jekyll site needs
    none, and a repo can have an unrelated root `package.json`, like this
    one). Fixer declares `jekyll-sitemap`/`jekyll-seo-tag` in `_config.yml`,
    writes `_includes/head-custom.html` (`{% seo %}` — the `pages-themes/*`
    extension point), `404.md`, `robots.txt`, `llms.txt` stub.
    **`markdown-url-support` deliberately not attempted** — tried a
    split-file mirror, reverted: two files kept in sync by hand drifts the
    moment one is edited without the other; not worth it for one check (see
    WORKLOG.md `v1.11.0` for the full reasoning).
    **Live rescan, 2026-09-11**: pushed, GitHub Pages rebuilt, rescanned
    against the pre-fix baseline. afdocs **0 → 72 (C)**: `llms-txt-exists`,
    `llms-txt-size`, `markdown-code-fence-validity` fixed; `sitemap.xml` and
    `llms.txt` both confirmed live (`200`), `{% seo %}` confirmed rendering
    JSON-LD/canonical/og:type in the actual homepage HTML. is-agentic stayed
    at 12 — its relevant checks fail on "could not fetch homepage," a
    scanner-side issue unrelated to this fixer, not a regression (see #19).
    One regression: `content-start-position` (page-size) flipped pass→fail,
    "1 of 6 pages have content starting past 50%" — pre-existing content
    layout, not something this fixer touched; not investigated this session.

16. Docs site beyond README, published via GitHub Pages — **done 2026-09-10**.
    `docs/` (plain Markdown, GitHub's built-in Jekyll build,
    `jekyll-theme-minimal`, no generator dependency in `src/`): `index.md`
    (landing pitch + quickstart), `install.md`, `cli-reference.md`,
    `contributing.md` (thin pointer to CONTRIBUTING.md, not duplicated).
    Pages enabled via API, source `main`:`/docs`. Live at
    https://dkdev24.github.io/siteready/. Content adapted from README.md, no
    new/internal identifiers introduced.
