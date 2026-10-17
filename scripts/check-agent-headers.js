// Regression check for the agent-headers scanner and the Cloudflare Pages
// middleware template. The generated middleware runs against in-memory assets
// and must pass every check; a middleware with the old bug (`<path>.md`
// lookup for files that already have an extension, near-miss redirects for
// index files) must fail the .md-link and index-file checks.
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
  "/docs/llms.txt": "- [Page](https://site.test/docs/page/): markdown: https://site.test/docs/page.md",
  // Root index links only a scoped index; the .md links live in the scoped one.
  "/llms.txt": "# Site\n\n- [Docs index](https://site.test/docs/llms.txt)",
  "/robots.txt": "User-agent: *\nAllow: /",
  "/sitemap.xml": "<urlset/>",
  "/404.md": "# Not found",
};

function serveAsset(url) {
  const { pathname } = new URL(url);
  const file = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  return file in ASSETS ? new Response(ASSETS[file], { status: 200 }) : new Response("nope", { status: 404 });
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
    const fixed = (request) =>
      onRequest({
        request,
        env: { ASSETS: { fetch: (req) => serveAsset(req instanceof Request ? req.url : String(req)) } },
        next: async () => serveAsset(request.url),
      });

    const good = await runAgentHeadersScan(ORIGIN, { fetchImpl: fetchVia(fixed) });
    const goodStatus = Object.fromEntries(good.normalized.checks.map((c) => [c.id, c.status]));
    assert.deepEqual(
      goodStatus,
      {
        "agent-headers-index-files": "pass",
        "agent-headers-md-links": "pass",
        "agent-headers-pages": "pass",
        "agent-headers-well-known": "pass",
      },
      `generated middleware should pass every check: ${JSON.stringify(good.normalized.checks, null, 2)}`
    );
    assert.equal(good.normalized.score.overall, 100);

    // Sanity: the generated middleware still negotiates pages to markdown.
    const page = await fixed(new Request(`${ORIGIN}/docs/page/`, { headers: { Accept: "text/markdown" } }));
    assert.equal(await page.text(), "# Page");

    const bad = await runAgentHeadersScan(ORIGIN, { fetchImpl: fetchVia(buggyMiddleware) });
    const badStatus = Object.fromEntries(bad.normalized.checks.map((c) => [c.id, c.status]));
    assert.equal(badStatus["agent-headers-md-links"], "fail", "buggy middleware: .md links must fail");
    assert.equal(badStatus["agent-headers-index-files"], "fail", "buggy middleware: index files must fail");
    assert.equal(badStatus["agent-headers-pages"], "pass", "buggy middleware still serves pages");
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
