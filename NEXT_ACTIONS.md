# NEXT_ACTIONS.md

Open TODOs, numbered. Replace this file's contents at the end of a session that
changes the list (closes an item, adds one, or reorders priority). Struck-through
items are done but kept briefly for context; drop them once superseded.

---

0. **[TOP PRIORITY, decision pending]** `loop`'s Cloudflare Quick Tunnel
   support for hosted scanners (`src/lib/tunnel.js`, wired into `loop.js`)
   tested unreliable this session — 1 success in 4 attempts, DNS resolution
   failures on the `*.trycloudflare.com` hostname. Pick one (see WORKLOG.md's
   2026-09-09 "loop + Hosted Scanners via Tunnel" entry for full detail): (1)
   add retry-with-a-fresh-tunnel-per-attempt, (2) switch to a named/
   authenticated Cloudflare Tunnel (needs a CF account), or (3) roll back to
   the hard-reject and document the limitation. Whichever is chosen,
   re-verify with a real `loop` run against `examples/astro-cf-pages
   --scanners ora` (or `is-agentic`) before considering this done or bumping
   the version.
1. ~~Build a synthetic `examples/astro-cf-pages/` fixture~~ — done.
2. Re-run `enhance` (plain-Astro fixer) against a **fresh** site that has
   none of these fixes yet and confirm the `is-agentic`/`afdocs` score
   actually moves on a real deploy — verification so far has been structural
   (file writes, idempotency) against a site that already had most of the
   content-side fixes applied by hand, not a full before/after score delta.
   Note: `afdocs`' `overall` score is gated on `llms.txt` existing (see
   WORKLOG.md) — a "real deploy" check for this fixer should look at
   individual checks (`http-status-codes`, `content-negotiation`) moving,
   not `overall`, since the plain-Astro fixer never writes `llms.txt` by
   design.
3. The "when to use this" `llms.txt` section is **not** a generic fixer
   candidate for either Astro fixer — it requires product-specific prose a
   fixer can't invent. Leave as manual guidance, unless a safe generic
   heuristic turns up.
4. Decide/document a policy for `org-schema-completeness` (`contactPoint`,
   `address`) and `trust-anchors` on doc subdomains that intentionally defer
   identity/legal pages to a separate corporate domain — right now these
   just sit as permanent backlog with no way to mark them N/A.
5. Test the installed skill against another unrelated real website project
   to broaden dogfood coverage.
6. Add fixers for additional frameworks/platforms as demand comes in (see
   CONTRIBUTING.md for the fixer contribution process).
7. ~~Consider expanding scanner coverage beyond afdocs + Vercel Is Agentic.~~ —
   done (Ora scanner). No CI/fixture coverage for it yet (same "needs a real
   deploy" gap as #2, since `loop` can't reach hosted scanners at all) — fold
   into #2's real-deploy verification, or give it its own pass once #2
   happens.
8. Confirm `ora.js`'s per-check `id`s are stable across the `format=audit`
   schema version the docs mention — the adapter was built off the OpenAPI
   spec + docs prose, not a pinned schema version number the way afdocs/
   is-agentic pin CLI versions, since Ora is API-only with no version to pin
   against. Worth a periodic sanity re-check against `ora.ai/api/openapi.json`
   if `normalize()` ever starts producing unexpected nulls.
9. Confirm `.github/workflows/scanner-version-check.yml` actually fires and
   behaves as intended once merged to `main` — validated the YAML structure
   and the `GITHUB_OUTPUT`/`behind` signal locally, but the scheduled
   trigger, the label auto-creation on first issue, and the dedupe-by-label
   search were never exercised against a real Actions run. Trigger it once
   manually via `workflow_dispatch` after merge and check the result.
10. **Site-type filtering** (`--site-type content|api|application|auto`):
    scope which checks count toward the score by what kind of site is being
    scanned, so API-surface checks (openapi-spec, oauth-support,
    scoped-permissions, rate-limit-headers, api-versioning-policy, ...) don't
    drag down a pure content/docs site's grade just because it was never
    going to have a public API. This is the actual fix for ISSUES.md's
    `is-agentic` score-volatility entry (68 → 72 → 62 swings on
    a real production docs subdomain with no public API, concentrated in
    API-surface essential/recommended checks) — that entry currently says "no action item beyond awareness,"
    but excluding inapplicable checks from scoring (not just tolerating
    their volatility) is something siteready itself can do. Cloudflare's
    isitagentready.com already does this with its content-site/
    API-application picker. Design: a static, versioned check-applicability
    map (which check ids from afdocs/is-agentic/Ora apply to which site
    type), checks tagged not-applicable for the chosen type excluded from
    score math but still listed in the report under their own "Not
    applicable for this site type" section (distinct from `skip`, which
    means the scanner itself couldn't evaluate it) so nothing is silently
    hidden. `report.json` should record which `siteType` was used (or
    `auto`/`null`) so `diff-report` can warn if a baseline and a re-scan
    used different types instead of silently mis-comparing. Default stays
    unfiltered (`auto`) — additive only, no existing report/score changes
    unless a caller opts in. Not started.
11. **[DECISION NEEDED] Internal references were sanitized in the working
    tree, but they're still in the public repo's git history.** On 2026-09-09
    `siteready-plan.md` was found at the root of the **public**
    `dkdev24/siteready` repo still carrying the origin project's identity: the
    internal site hostname, internal planning/report document names,
    objective/KPI references, internal wiki mentions, and relative links into
    the private source repo's `references/` directory. §3 of that very file is
    the sanitization boundary that this violated — the v1.0 sanitization pass
    covered README, the fixture, and code comments, but not the plan, because
    it still lived in the private repo at the time and only moved in later.
    Two smaller leaks of the same hostname in `ISSUES.md` and this file were
    sanitized in the same pass. **All of that is fixed in the working tree, but
    a `git log -S` confirms the strings are present in already-pushed commits**,
    so anyone can still read them via history or a fork. Decide: (a) accept it
    — the material is mildly-sensitive employer context, not credentials, and
    the hostname is a public site anyway; (b) rewrite history
    (`git filter-repo`, force-push, and note that forks/caches/clones won't be
    reached). (b) is destructive and irreversible, so it needs an explicit
    go-ahead. Also worth a one-time audit of the rest of the history for the
    same class of string, not just the plan file.
    **Left deliberately untouched:** `WORKLOG.md` still names the origin
    hostname in four places (the v0.3.0 dogfood entry and three later
    references). AGENTS.md's rule is that WORKLOG entries are append-only and
    past entries are never edited, so sanitizing them would break the log's
    own contract — and unlike the plan file, they're honest historical record
    rather than a live design doc presented as current. Fold them into
    whichever option is chosen above rather than editing them piecemeal.
12. **Publish decision, now that the package is publishable.** `private: true`
    is removed and `npm pack --dry-run` is clean (25 files, 42.5 kB, no
    `examples/`, `out/`, or internal docs), so `npm publish` would work — but
    it hasn't been run. The `repository`/`homepage`/`bugs` URLs point at
    `github.com/dkdev24/siteready`, which is public, so those resolve fine.
    The one open thing: the README now documents
    `npm install -g siteready` / `npx siteready` as the primary install path,
    which is a promise that isn't true until the first publish — until then
    only the `git clone` + `npm link` path in that section actually works.
    Names `siteready` and `site-ready` were both unclaimed on npm as of
    2026-09-09. Not started.
13. **Fixer coverage is the competitive gap, not scanner count.** Against
    URL-only GEO/prompt-audit tooling (see README "How this differs from GEO /
    prompt-based audit skills"), siteready's one real weakness is that
    `enhance` reports `unsupported` outside Astro (± Starlight) + Cloudflare
    Pages — everywhere else it degrades to a nicer scanner wrapper. Highest-
    leverage single addition: **Next.js + Vercel**, which is the most common
    stack among the doc/content sites these scanners target and the one whose
    absence is most often the reason a site can't use `enhance` at all. Same
    additive contract as the existing fixers (new `src/fixers/nextjs.js` +
    `src/platforms/vercel.js`, no changes to shipped ones — see
    CONTRIBUTING.md), plus a fixture under `examples/` so `verify-loop.js`
    covers it. Not started.
14. **Surface-area parity: multi-site compare + score-over-time tracking.**
    GEO packs ship a competitor-comparison and a monitoring skill; siteready
    has neither, which makes it look thinner than it is even where its fixers
    win. Both are cheap because the primitives already exist:
    - *Compare*: scan N URLs in one invocation and render them side by side.
      `diff-report.js` already diffs two normalized reports check-by-check —
      this is mostly an N-way presentation layer over `scanTarget()` plus a
      CLI verb (`node src/cli.js compare <url> <url> ...`). Note the hosted-
      scanner rate limits when fanning out (Ora: 10/min, 30/day) — serialize
      or cap concurrency.
    - *Monitor*: `scan` already writes timestamped `out/<host>-<ts>/report.json`
      directories, so trend tracking is reading a series of those and emitting
      a score-over-time table plus a regression flag — no new scanning code.
      Should reuse `diff-report`'s check-level fixed/regressed logic rather
      than comparing overall scores only, and should warn on `siteType`
      mismatch once #10 lands.
    Do these *after* #13 — they widen the surface, but fixer coverage is what
    actually differentiates. Not started.
