// Regression check for the Next.js agent-readiness generator
// (src/templates/next-agent-readiness.mjs) and how the nextjs fixer wires it in.
// Covers the HTML -> markdown converter on the shapes React/Next actually emits,
// the generator end to end on a fake `.next` build, its never-fail and
// only-touch-our-own-files rules, and the package.json hook. No installs needed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyNextjsFixes } from "../src/fixers/nextjs.js";
import { htmlToMarkdown, pageMeta } from "../src/templates/next-agent-readiness.mjs";

const TEMPLATE = fileURLToPath(new URL("../src/templates/next-agent-readiness.mjs", import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "siteready-next-ar-"));
let n = 0;
const md = (html, opts) => htmlToMarkdown(`<html><head><title>t</title></head><body><main>${html}</main></body></html>`, opts);

try {
  // --- converter ---
  assert.equal(md("<h1>Hi <!-- -->there</h1><p>a &amp; b &#x27;c&#x27; &lt;d&gt;</p>"), "# Hi there\n\na & b 'c' <d>");
  // RSC payload, styles, hidden/aria-hidden, buttons and svg never leak into text
  const noisy = md('<style>.a{color:red}</style><script>self.__next_f.push([1,"{\\"x\\":1}"])</script><div hidden>secret</div><span aria-hidden="true">dec</span><button>Copy</button><svg><title>icon</title></svg><p>kept</p>');
  assert.equal(noisy, "kept");
  // code blocks keep angle brackets and blank lines
  assert.equal(md('<pre><code class="language-html">&lt;div&gt;\n\n&lt;/div&gt;</code></pre>'), "```html\n<div>\n\n</div>\n```");
  // nested lists, links wrapping spans, br, inline code
  assert.equal(md("<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul>"), "- one\n  - two\n- three");
  assert.equal(md('<p><a href="/x"><span>link</span></a> and <code>c</code></p>'), "[link](/x) and `c`");
  // adjacent links stay apart; card links keep the heading as text; origin makes links absolute
  assert.equal(md('<div><a href="/a">A</a><a href="/b">B</a></div>', { origin: "https://e.com" }), "[A](https://e.com/a) [B](https://e.com/b)");
  assert.equal(md('<a href="/c"><h3>Title</h3><p>Blurb</p></a>'), "[Title](/c): Blurb");
  // table
  assert.equal(md("<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2|3</td></tr></tbody></table>"), "| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
  // no <main>: body minus header/nav/footer
  assert.equal(htmlToMarkdown("<html><body><header>H</header><nav>N</nav><h1>T</h1><p>body</p><footer>F</footer></body></html>"), "# T\n\nbody");
  // metadata
  const meta = pageMeta('<html><head><title>Page</title><meta name="description" content="D"/><link rel="canonical" href="https://e.com/p"/><meta name="robots" content="noindex"/></head></html>');
  assert.deepEqual([meta.title, meta.description, meta.canonicalOrigin, meta.noindex], ["Page", "D", "https://e.com", true]);

  // --- generator on a fake build ---
  async function project(files) {
    const root = path.join(tmp, `p${n++}`);
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    }
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await copyFile(TEMPLATE, path.join(root, "scripts/agent-readiness.mjs"));
    return root;
  }
  const page = (title, body, head = "") => `<html><head><title>${title}</title><meta name="description" content="About ${title}"/>${head}</head><body><div hidden><!--$--></div><main><h1>${title}</h1><p>${body} is long enough to count.</p></main></body></html>`;
  const manifest = (routes) => JSON.stringify({ version: 4, routes: Object.fromEntries(routes.map((r) => [r, { routeType: "page" }])) });
  const run = (root, env = {}) => spawnSync(process.execPath, ["scripts/agent-readiness.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });
  const files = {
    ".next/prerender-manifest.json": JSON.stringify({
      version: 4,
      routes: {
        "/": { routeType: "page" },
        "/docs/a": { routeType: "page" },
        "/_not-found": { routeType: "page", initialStatus: 404 },
        "/missing-status": { routeType: "page", initialStatus: 404 },
        "/api/x": { routeType: "route" },
        "/robots.txt": { routeType: "page" },
        "/hidden": { routeType: "page" },
      },
    }),
    ".next/server/app/index.html": page("Home", "Welcome", '<link rel="canonical" href="https://example.com/"/>'),
    ".next/server/app/docs/a.html": page("Doc A", "Alpha"),
    ".next/server/app/hidden.html": page("Hidden", "Secret", '<meta name="robots" content="noindex"/>'),
    ".next/server/app/sitemap.xml.html": page("Runtime probe", "Not in the manifest"),
    "public/keep.md": "hand written\n",
  };
  let root = await project(files);
  let r = run(root);
  assert.equal(r.status, 0, r.stderr);
  const read = (rel) => readFile(path.join(root, rel), "utf8");
  const index = await read("public/index.md");
  assert.match(index, /^> For the complete documentation index, see \[llms\.txt\]\(https:\/\/example\.com\/llms\.txt\)\.\n\n# Home/);
  assert.ok(index.trimEnd().endsWith("<!-- generated by siteready agent-readiness -->"));
  assert.ok(existsSync(path.join(root, "public/docs/a.md")));
  for (const absent of ["public/hidden.md", "public/_not-found.md", "public/sitemap.xml.md", "public/api/x.md", "public/robots.txt.md"]) assert.ok(!existsSync(path.join(root, absent)), absent);
  const llms = await read("public/llms.txt");
  assert.match(llms, /^# Home\n\n> About Home\n\n## Pages\n\n- \[Home\]\(https:\/\/example\.com\/index\.md\)/);
  assert.match(llms, /## Docs\n\n- \[Doc A\]\(https:\/\/example\.com\/docs\/a\.md\): About Doc A/);
  assert.equal(await read("public/keep.md"), "hand written\n");

  // a hand-written llms.txt or .md is never replaced; a stale file of ours is removed
  await writeFile(path.join(root, "public/llms.txt"), "mine\n");
  await writeFile(path.join(root, "public/docs/a.md"), "mine too\n");
  await writeFile(path.join(root, "public/gone.md"), `old\n\n<!-- generated by siteready agent-readiness -->\n`);
  r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(await read("public/llms.txt"), "mine\n");
  assert.equal(await read("public/docs/a.md"), "mine too\n");
  assert.ok(!existsSync(path.join(root, "public/gone.md")), "stale generated file should be removed");
  assert.match(r.stdout, /1 existing \.md left alone/);

  // an app/llms.txt route handler owns that URL
  root = await project({ ...files, "app/llms.txt/route.js": "export const GET = () => new Response('x');" });
  r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(path.join(root, "public/llms.txt")));

  // mirrors live at the canonical URL + .md even when the route differs (rewritten default locale)
  root = await project({
    ".next/prerender-manifest.json": manifest(["/en", "/en/x", "/ko/x"]),
    ".next/server/app/en.html": page("Home", "Welcome", '<link rel="canonical" href="https://example.com/"/>'),
    ".next/server/app/en/x.html": page("X", "English page", '<link rel="canonical" href="https://example.com/x"/>'),
    ".next/server/app/ko/x.html": page("KX", "Korean page", '<link rel="canonical" href="https://example.com/ko/x"/>'),
  });
  r = run(root);
  assert.equal(r.status, 0, r.stderr);
  for (const rel of ["public/index.md", "public/x.md", "public/ko/x.md"]) assert.ok(existsSync(path.join(root, rel)), rel);
  assert.ok(!existsSync(path.join(root, "public/en/x.md")));
  assert.match(await read("public/llms.txt"), /- \[X\]\(https:\/\/example\.com\/x\.md\)/);
  // AGENT_READINESS_ORIGIN=none: canonical paths kept, links root-relative, no warning
  r = run(root, { AGENT_READINESS_ORIGIN: "none" });
  assert.match(await read("public/llms.txt"), /- \[X\]\(\/x\.md\)/);
  assert.ok(!/root-relative/.test(r.stderr));

  // origin override, and root-relative links with a warning when none is known
  root = await project({ ...files, ".next/server/app/index.html": page("Home", "Welcome") });
  r = run(root, { AGENT_READINESS_ORIGIN: "https://o.example/" });
  assert.match(await read("public/llms.txt"), /\(https:\/\/o\.example\/index\.md\)/);
  root = await project({ ...files, ".next/server/app/index.html": page("Home", "Welcome") });
  r = run(root);
  assert.match(await read("public/llms.txt"), /\(\/index\.md\)/);
  assert.match(r.stderr, /root-relative/);

  // never fails the build: missing, corrupt or odd manifests exit 0 with a warning
  for (const bad of [null, "{not json", JSON.stringify({ version: 9 })]) {
    root = await project(bad === null ? { "public/x.txt": "x" } : { ".next/prerender-manifest.json": bad });
    r = run(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /nothing generated/);
  }

  // large sites split llms.txt into per-section files
  const many = Array.from({ length: 700 }, (_, i) => `/a/page-${i}`).concat(Array.from({ length: 5 }, (_, i) => `/b/page-${i}`));
  const bigFiles = { ".next/prerender-manifest.json": manifest(many) };
  for (const route of many) bigFiles[`.next/server/app${route}.html`] = page(`Page ${route.split("/").pop()}`, `Section content for ${route} with a long description to take up room`.repeat(2));
  root = await project(bigFiles);
  r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(await read("public/llms.txt"), /## Sections\n\n- \[A\]\(\/a\/llms\.txt\)\n- \[B\]\(\/b\/llms\.txt\)/);
  assert.ok(existsSync(path.join(root, "public/a/llms.txt")));

  // --- fixer wiring ---
  async function app(pkg, extra = {}) {
    const dir = path.join(tmp, `p${n++}`);
    await mkdir(path.join(dir, "app"), { recursive: true });
    await writeFile(path.join(dir, "package.json"), pkg);
    for (const [rel, content] of Object.entries(extra)) await writeFile(path.join(dir, rel), content);
    return dir;
  }
  const tabbed = '{\n\t"name": "x",\n\t"scripts": {\n\t\t"build": "next build"\n\t},\n\t"dependencies": { "next": "^16.0.0" }\n}\n';
  root = await app(tabbed);
  let f = await applyNextjsFixes(root);
  const pkgText = await readFile(path.join(root, "package.json"), "utf8");
  assert.match(pkgText, /\n\t\t"postbuild": "node scripts\/agent-readiness\.mjs"/);
  assert.ok(pkgText.endsWith("}\n"));
  assert.ok(f.written.includes(path.join(root, "scripts/agent-readiness.mjs")) && f.written.includes(path.join(root, "package.json")));
  assert.ok(f.warnings.some((w) => /gitignore/.test(w)));
  f = await applyNextjsFixes(root); // idempotent
  assert.ok(!f.written.some((p) => /package\.json|agent-readiness/.test(p)));
  assert.equal(await readFile(path.join(root, "package.json"), "utf8"), pkgText);

  root = await app('{ "scripts": { "build": "next build", "postbuild": "echo mine" } }');
  f = await applyNextjsFixes(root);
  assert.match(await readFile(path.join(root, "package.json"), "utf8"), /echo mine/);
  assert.ok(f.skipped.some((s) => /postbuild script already exists/.test(s)));

  root = await app('{ "scripts": { "build": "next build" } }', { "next.config.js": 'module.exports = { output: "export" };' });
  f = await applyNextjsFixes(root);
  assert.ok(!existsSync(path.join(root, "scripts/agent-readiness.mjs")));
  assert.ok(f.warnings.some((w) => /output: "export"/.test(w)));

  console.log("OK: next agent-readiness converter, generator (ownership, never-fail, split) and fixer wiring verified.");
} finally {
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
