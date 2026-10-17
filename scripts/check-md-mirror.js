// Regression check for the Starlight `.md` mirror the astro-starlight fixer
// writes. The mirror used to serve the raw MDX body: relative links broke
// outside the HTML page (afdocs markdown-link-portability) and component
// tags hid card text (afdocs markdown-content-parity). Runs the generated
// src/lib/md-mirror.js on a fixture body, and checks that an existing
// raw-body route gets a warning instead of being overwritten.
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyAstroStarlightFixes } from "../src/fixers/astro-starlight.js";

const BODY = `import { LinkCard, CardGrid, Aside, Badge } from '@astrojs/starlight/components';

See [the guide](../guide/), [setup](./setup/), [home](/) and ![diagram](/img/a.png).
<a href="../raw-html/">raw</a>

<CardGrid>
<LinkCard
  title="HTML5 Player"
  href="./html5-player/"
  description="Play DRM content in a browser."
/>
<LinkCard title="Native" href="/native/" />
</CardGrid>

<Aside type="caution" title="Heads up">Keys are secret.</Aside> <Badge text="Beta" />

\`\`\`mdx
[keep](../raw/) <LinkCard title="kept" href="./x/" />
\`\`\`
`;

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "siteready-md-mirror-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  await withTempRepo(async (dir) => {
    await applyAstroStarlightFixes(dir);
    const route = await readFile(path.join(dir, "src/pages/[...slug].md.ts"), "utf8");
    assert.match(route, /toAgentMarkdown\(entry\.body/, "mirror route should run the body through toAgentMarkdown");

    const lib = path.join(dir, "src/lib/md-mirror.mjs");
    await copyFile(path.join(dir, "src/lib/md-mirror.js"), lib);
    const { toAgentMarkdown } = await import(pathToFileURL(lib).href);

    const out = toAgentMarkdown(BODY, new URL("https://site.test/docs/clients/"));
    const [prose, code] = out.split("```mdx");

    assert.ok(!/^import /m.test(out), "import lines should be dropped");
    assert.ok(!/<\/?(LinkCard|CardGrid|Aside|Badge)\b/.test(prose), `component tags should be converted:\n${prose}`);
    assert.match(prose, /\[the guide\]\(https:\/\/site\.test\/docs\/guide\/\)/);
    assert.match(prose, /\[setup\]\(https:\/\/site\.test\/docs\/clients\/setup\/\)/);
    assert.match(prose, /\[home\]\(https:\/\/site\.test\/\)/);
    assert.match(prose, /!\[diagram\]\(https:\/\/site\.test\/img\/a\.png\)/);
    assert.match(prose, /href="https:\/\/site\.test\/docs\/raw-html\/"/);
    // Description on its own line, so "Title Description" text matching works.
    assert.match(prose, /^- \[HTML5 Player\]\(https:\/\/site\.test\/docs\/clients\/html5-player\/\)\n {2}Play DRM content in a browser\.$/m);
    assert.match(prose, /^- \[Native\]\(https:\/\/site\.test\/native\/\)$/m);
    assert.match(prose, /\*\*Heads up:\*\* Keys are secret\. \(Beta\)/);
    assert.ok(!/\]\((\.\.?\/|\/)/.test(prose), `no relative link targets should remain:\n${prose}`);
    assert.equal(code, '\n[keep](../raw/) <LinkCard title="kept" href="./x/" />\n```\n', "fenced code must be untouched");

    // No `site` in astro.config: root-relative instead of absolute.
    assert.equal(toAgentMarkdown("[a](../b/)", new URL("http://localhost/docs/clients/"), false), "[a](/docs/b/)");
  });

  // A mirror route that already exists is never overwritten; one serving the
  // raw body gets a warning pointing at the new lib.
  await withTempRepo(async (dir) => {
    await mkdir(path.join(dir, "src/pages"), { recursive: true });
    const routePath = path.join(dir, "src/pages/[...slug].md.ts");
    await writeFile(routePath, "export const GET = ({ props }) => new Response(props.entry.body);\n");
    const result = await applyAstroStarlightFixes(dir);
    assert.equal(await readFile(routePath, "utf8"), "export const GET = ({ props }) => new Response(props.entry.body);\n");
    assert.ok(result.written.some((f) => f.endsWith(path.join("src", "lib", "md-mirror.js"))), "lib should still be written");
    assert.ok(result.warnings.some((w) => w.includes("toAgentMarkdown")), "raw-body route should get a warning");
  });

  console.log("md-mirror check: OK (links absolute, components converted, code untouched, old routes warned)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
