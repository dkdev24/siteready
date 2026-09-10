# NEXT_ACTIONS.md

Open TODOs, numbered. Replace this file's contents at the end of a session that
changes the list (closes an item, adds one, or reorders priority). Struck-through
items are done but kept briefly for context; drop them once superseded.

---

0. ~~`loop`'s Cloudflare Quick Tunnel support for hosted scanners tested
   unreliable (1 success in 4 attempts).~~ — **RESOLVED 2026-09-09: option
   (1), retry with a fresh tunnel per attempt.** Shipped in v1.4.0 and
   verified by a real `loop examples/astro-cf-pages --scanners ora` run. The
   retry unit is a whole tunnel (kill the connector, spawn a new one) because
   the failure was the *hostname* never resolving — re-probing the same URL
   never recovers, a fresh random hostname does. Residual risk, not an action
   item: Quick Tunnels are anonymous and best-effort by design, so a run can
   still exhaust all 3 attempts on a bad network day; the error says so and
   points at `SITEREADY_TUNNEL_ATTEMPTS`. If that turns out to be routine
   rather than rare, the fallback is still option (2), a named/authenticated
   tunnel (needs a CF account).
1. ~~Build a synthetic `examples/astro-cf-pages/` fixture~~ — done.
2. ~~Re-run `enhance` (plain-Astro fixer) against a fresh site and confirm
   score movement on a real deploy~~ — **DONE 2026-09-09**, see WORKLOG.md.
   Result: mechanically verified (baseline scan -> enhance -> commit/push ->
   live Cloudflare Pages deploy -> rescan -> diff-report), but
   `danielkimdev.com` wasn't fresh enough to show movement — it already
   scored 94/98 and both `http-status-codes` and `content-negotiation` were
   already `pass` pre-fix, so the new `robots.txt`/`_middleware.js` didn't
   flip anything. Still open: find (or build) a genuinely fixer-naive Astro
   site to see an actual score delta.
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
   done (Ora scanner). No CI/fixture coverage for it yet — `loop` can now
   reach it via the tunnel (#0), but `verify-loop.js` still runs afdocs only,
   deliberately: a hosted scanner in CI means a network round-trip through an
   anonymous best-effort tunnel plus Ora's rate limits (10/min, 30/day), which
   would make CI flaky for little signal. Fold the Ora check into #2's
   real-deploy verification instead.
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
11. ~~**[DECISION NEEDED]** Internal references remain in the public repo's
    git history.~~ — **RESOLVED 2026-09-09: option (a), accepted as-is.**
    Daniel's call; no history rewrite. Kept below as the standing record of
    what's in history and why it's fine, so a future session doesn't
    re-litigate it or "helpfully" try to purge it. Going forward the only
    action is *not to add new ones* — see the boundary rule now in AGENTS.md.
    Original finding: on 2026-09-09
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
    so anyone can still read them via history or a fork. Accepted: the
    material is mildly-sensitive employer context, not credentials, and the
    hostname is a public site anyway — not worth a destructive force-push that
    wouldn't reach existing forks, clones, or caches regardless.
    **Also left untouched:** `WORKLOG.md` still names the origin
    hostname in four places (the v0.3.0 dogfood entry and three later
    references). AGENTS.md's rule is that WORKLOG entries are append-only and
    past entries are never edited, so sanitizing them would break the log's
    own contract — and unlike the plan file, they're honest historical record
    rather than a live design doc presented as current. They stay.
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
13. ~~Fixer coverage gap: Next.js + Vercel~~ — **DONE 2026-09-10**, see
    WORKLOG.md. `src/fixers/nextjs.js` (not-found page, robots.txt) +
    `src/platforms/vercel.js` (`proxy.js` content-negotiation — Next.js 16
    renamed `middleware.js`), `detect-stack.js`/`enhance.js` generalized to
    dispatch fixers by platform instead of hardcoding Cloudflare Pages,
    `lib/local-server.js` extended with `next start` support so `loop`
    covers it too. `examples/nextjs-vercel` fixture verified end-to-end via
    `verify-loop.js`: `content-negotiation` flips fail → pass. Known gap: the
    passthrough response's `Vary: Accept` header doesn't survive Next.js's
    static-cache path (verified against a real `next start` server) — the
    negotiation itself is unaffected; see `platforms/vercel.js` comment.
14. ~~Surface-area parity: multi-site compare + score-over-time tracking.~~ — **DONE 2026-09-10**,
    see WORKLOG.md v1.6.0: `compare` and `monitor` CLI commands (`src/compare.js`, `src/monitor.js`).
    Original scope note below, kept for the design rationale.
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
15. ~~One failing scanner aborts the whole scan.~~ — **DONE 2026-09-10**, see WORKLOG.md v1.5.1.
    `scanTarget()` (`src/scan.js`)
    awaits each scanner in a loop with no try/catch and only calls
    `buildReport()` after all of them return, so any single failure — most
    likely an Ora HTTP 429, but equally a network blip on a hosted scanner —
    throws away the scanners that already succeeded and writes no
    `report.json` at all. Scanner order doesn't mitigate it. Surfaced while
    documenting Ora's rate limits (2026-09-09); documented as-is in `--help`
    and `SKILL.md` rather than silently changed, because the fix touches the
    orchestrator's contract: `report.json`/`report.md` would need a per-scanner
    `error` state, `buildReport()` would need to score a partial set (and say
    it's partial), and `diff-report` would need to refuse to compare a baseline
    against a re-scan that's missing one of its scanners rather than reporting
    a phantom regression. Worth doing — a 20-minute afdocs+is-agentic scan
    shouldn't be lost to a rate limit on an opt-in third scanner — but it's a
    deliberate design change, not a patch. Not started.
