// Regression check for the agent-headers scanner and the Cloudflare Pages
// middleware template. The generated middleware runs against in-memory assets
// and must pass every check; a middleware with the old bug (`<path>.md`
// lookup for files that already have an extension, near-miss redirects for
// index files) must fail the .md-link and index-file checks. The fifth check,
// md-duplicate-signal, is not the middleware's job — it reads the
// `X-Robots-Tag: noindex` the `_headers` fixer writes — so `serveAsset`
// models a site with that fix applied (`mdNoindex: true`), and a separate
// no-signal scenario proves the check fails when the header is absent.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyCloudflarePagesFixes } from "../src/platforms/cloudflare-pages.js";
import { runAgentHeadersScan } from "../src/scanners/agent-headers.js";

const ORIGIN = "https://site.test";
const ASSETS = {
  "/index.html": "<h1>Home</h1>",
  "/index.md": "# Home",
  "/docs/page/index.html": "<h1>Page</h1>",
  "/docs/page.md": "# Page",
  // A .md with no HTML twin: the duplicate check must pass it even with no
  // signal, so it pins the no-twin branch (its /docs/orphan/ page 404s).
  "/docs/orphan.md": "# Orphan",
  "/docs/llms.txt": "- [Page](https://site.test/docs/page/): markdown: https://site.test/docs/page.md\n- [Orphan](https://site.test/docs/orphan/): markdown: https://site.test/docs/orphan.md",
  // Root index links only a scoped index; the .md links live in the scoped one.
  "/llms.txt": "# Site\n\n- [Docs index](https://site.test/docs/llms.txt)",
  "/robots.txt": "User-agent: *\nAllow: /",
  "/sitemap.xml": "<urlset/>",
  "/404.md": "# Not found",
};

function serveAsset(url, { mdNoindex = true } = {}) {
  const { pathname } = new URL(url);
  const file = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  if (!(file in ASSETS)) return new Response("nope", { status: 404 });
  // Models a site with the `_headers` fixer applied: every .md response
  // carries X-Robots-Tag: noindex. The middleware never sets this header.
  const headers = mdNoindex && file.endsWith(".md") ? { "X-Robots-Tag": "noindex" } : {};
  return new Response(ASSETS[file], { status: 200, headers });
}

// Old template behavior: every markdown-preferring request is treated as a page.
async function buggyMiddleware(request) {
  const wantsMarkdown = (request.headers.get("accept") ?? "").includes("text/markdown") ||
    /GPTBot/.test(request.headers.get("user-agent") ?? "");
  if (!wantsMarkdown) return serveAsset(request.url);
  const { pathname } = new URL(request.url);
  if (pathname === "/docs/llms.txt") return new Response(null, { status: 301, headers: { location: "/docs/" } });
  const md = serveAsset(`${ORIGIN}${pathname.replace(/\/$/, "") || "/index"}.md`);
  return md.ok ? md : new Response(ASSETS["/404.md"], { status: 404 });
}

function fetchVia(handler) {
  return (target, { headers }) => handler(new Request(target, { headers }));
}

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "siteready-agent-headers-"));
  try {
    await applyCloudflarePagesFixes(dir);
    const file = path.join(dir, "functions", "_middleware.mjs");
    await import("node:fs/promises").then((fs) => fs.copyFile(path.join(dir, "functions", "_middleware.js"), file));
    const { onRequest } = await import(pathToFileURL(file).href);
    const makeFixed = (mdNoindex) => (request) =>
      onRequest({
        request,
        env: { ASSETS: { fetch: (req) => serveAsset(req instanceof Request ? req.url : String(req), { mdNoindex }) } },
        next: async () => serveAsset(request.url, { mdNoindex }),
      });
    const fixed = makeFixed(true);

    const good = await runAgentHeadersScan(ORIGIN, { fetchImpl: fetchVia(fixed) });
    const goodStatus = Object.fromEntries(good.normalized.checks.map((c) => [c.id, c.status]));
    assert.deepEqual(
      goodStatus,
      {
        "agent-headers-index-files": "pass",
        "agent-headers-md-links": "pass",
        "agent-headers-pages": "pass",
        "agent-headers-well-known": "pass",
        "md-duplicate-signal": "pass",
      },
      `generated middleware should pass every check: ${JSON.stringify(good.normalized.checks, null, 2)}`
    );
    assert.equal(good.normalized.score.overall, 100);

    // Same middleware, but the .md responses carry no duplicate signal: only
    // md-duplicate-signal may fail, and it must fail on the twinned page.md
    // but not on the twin-less orphan.md.
    const noSignal = await runAgentHeadersScan(ORIGIN, { fetchImpl: fetchVia(makeFixed(false)) });
    const noSignalStatus = Object.fromEntries(noSignal.normalized.checks.map((c) => [c.id, c.status]));
    assert.equal(noSignalStatus["md-duplicate-signal"], "fail", "no-signal site: duplicate check must fail");
    for (const id of ["agent-headers-index-files", "agent-headers-md-links", "agent-headers-pages", "agent-headers-well-known"]) {
      assert.equal(noSignalStatus[id], "pass", `no-signal site: ${id} must still pass`);
    }
    const dupMessage = noSignal.normalized.checks.find((c) => c.id === "md-duplicate-signal").message;
    assert.match(dupMessage, /\/docs\/page\.md/, "duplicate message must name the twinned .md");
    assert.doesNotMatch(dupMessage, /orphan/, "duplicate message must not name the twin-less .md");

    // Sanity: the generated middleware still negotiates pages to markdown.
    const page = await fixed(new Request(`${ORIGIN}/docs/page/`, { headers: { Accept: "text/markdown" } }));
    assert.equal(await page.text(), "# Page");

    const bad = await runAgentHeadersScan(ORIGIN, { fetchImpl: fetchVia(buggyMiddleware) });
    const badStatus = Object.fromEntries(bad.normalized.checks.map((c) => [c.id, c.status]));
    assert.equal(badStatus["agent-headers-md-links"], "fail", "buggy middleware: .md links must fail");
    assert.equal(badStatus["agent-headers-index-files"], "fail", "buggy middleware: index files must fail");
    assert.equal(badStatus["agent-headers-pages"], "pass", "buggy middleware still serves pages");
    assert.equal(badStatus["md-duplicate-signal"], "pass", "buggy middleware doesn't affect the duplicate signal (it reads _headers, not negotiation)");
    assert.ok(bad.normalized.score.overall < 100);

    console.log("agent-headers check: OK (generated middleware passes, buggy middleware caught)");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
