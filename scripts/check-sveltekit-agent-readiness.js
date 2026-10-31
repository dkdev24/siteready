// Regression check for the SvelteKit agent-readiness generator
// (src/templates/sveltekit-agent-readiness.mjs), the sveltekit fixer that wires it in, and stack
// detection. Runs the generator on a fake adapter-static `build/`. No installs needed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectStack } from "../src/detect-stack.js";
import { applySveltekitFixes } from "../src/fixers/sveltekit.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "siteready-svelte-ar-"));
const page = (title, body, head = "") =>
  `<!doctype html><html lang="en"><head><title>${title}</title><meta name="description" content="About ${title}"><meta property="og:url" content="https://e.com${head}"></head><body data-x="1"><main>${body}</main></body></html>`;
const write = async (root, rel, content) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n");
};
const run = (root, env = {}) => spawnSync(process.execPath, ["scripts/agent-readiness.mjs"], { cwd: root, env: { ...process.env, ...env }, encoding: "utf8" });

try {
  // --- detection: workspace member app, wrangler config at the workspace root ---
  const ws = path.join(tmp, "ws");
  await write(ws, "package.json", { private: true });
  await write(ws, "pnpm-workspace.yaml", "packages:\n  - 'site'\n");
  await write(ws, "wrangler.toml", 'name = "x"\n');
  await write(ws, "site/package.json", { scripts: { build: "vite build" }, devDependencies: { "@sveltejs/kit": "^2", "@sveltejs/adapter-static": "^3" } });
  const stack = await detectStack(ws);
  assert.deepEqual([stack.framework, stack.platform, stack.supported, stack.siteRoot, stack.platformRoot], ["sveltekit", "cloudflare-pages", true, path.join(ws, "site"), ws]);

  // --- fixer + generator on a fake build ---
  const site = path.join(ws, "site");
  const fix = await applySveltekitFixes(site);
  assert.ok(fix.written.some((f) => f.endsWith("static/robots.txt")) && fix.written.some((f) => f.endsWith("package.json")));
  assert.equal(JSON.parse(await readFile(path.join(site, "package.json"), "utf8")).scripts.postbuild, "node scripts/agent-readiness.mjs");
  assert.match(await readFile(path.join(site, "scripts/agent-readiness.mjs"), "utf8"), /AGENT_READINESS_OUT \|\| "build"/);
  const again = await applySveltekitFixes(site);
  assert.deepEqual(again.written, [], "second enhance run must be a no-op");

  await write(site, "build/index.html", page("Home", "<h1>Home</h1><p>Welcome to the site, a real page.</p><a href='/docs/a/'>A</a>", "/"));
  await write(site, "build/docs/a/index.html", page("A", "<h1>A</h1><p>Page A has enough content.</p>", "/docs/a/"));
  await write(site, "build/docs/a.md", "# A (hand written)\n\nsee [b](./b.md)\n");
  await write(site, "build/_app/x.html", "<html></html>");
  await write(site, "build/404.html", "<html></html>");
  const first = run(site);
  assert.equal(first.status, 0);
  const home = await readFile(path.join(site, "build/index.html"), "utf8");
  assert.match(home, /<link rel="canonical" href="https:\/\/e\.com\/" data-siteready>/);
  assert.match(home, /"@type":"WebSite"/);
  assert.match(home, /<body data-x="1"><a href="https:\/\/e\.com\/llms\.txt" data-siteready/);
  const sub = await readFile(path.join(site, "build/docs/a/index.html"), "utf8");
  assert.match(sub, /rel="canonical" href="https:\/\/e\.com\/docs\/a\/"/);
  assert.doesNotMatch(sub, /ld\+json/, "JSON-LD only on the homepage");
  assert.match(await readFile(path.join(site, "build/index.md"), "utf8"), /^> For the complete documentation index, see \[llms\.txt\]\(https:\/\/e\.com\/llms\.txt\)/);
  assert.doesNotMatch(await readFile(path.join(site, "build/index.md"), "utf8"), /For the complete documentation index, see llms\.txt\s*$/m, "hidden pointer never leaks into markdown");
  assert.equal(await readFile(path.join(site, "build/docs/a.md"), "utf8"), "# A (hand written)\n\nsee [b](./b.md)\n", "foreign .md untouched");
  assert.ok(existsSync(path.join(site, "build/404.md")) && existsSync(path.join(site, "build/llms.txt")));
  assert.match(first.stderr, /path-relative links/);

  // idempotent re-run: HTML unchanged, no duplicate injection
  const second = run(site);
  assert.equal(await readFile(path.join(site, "build/index.html"), "utf8"), home);
  assert.match(second.stdout, /0 page\(s\) updated/);

  // a site-owned llms.txt is never replaced; no origin means no canonical/JSON-LD and a warning
  await write(site, "build/llms.txt", "# mine\n");
  await write(site, "build/p/index.html", "<html><head><title>P</title></head><body><main><h1>P</h1><p>no og url here at all.</p></main></body></html>");
  const noOrigin = run(site, { AGENT_READINESS_ORIGIN: "none" });
  assert.equal(await readFile(path.join(site, "build/llms.txt"), "utf8"), "# mine\n");
  assert.doesNotMatch(await readFile(path.join(site, "build/p/index.html"), "utf8"), /canonical/);
  assert.equal(noOrigin.status, 0);

  // never fails the build
  const nothing = run(site, { AGENT_READINESS_OUT: "does-not-exist" });
  assert.equal(nothing.status, 0);
  assert.match(nothing.stderr, /not found/);

  console.log("sveltekit agent-readiness: all checks passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
