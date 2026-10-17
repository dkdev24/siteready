// Regression check for monorepo path detection and AWS (CloudFront + OpenNext)
// platform detection, plus the platform fixer's file choice. Builds throwaway
// layouts in a temp dir (no installs), so it's cheap enough for `npm run lint`.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectStack } from "../src/detect-stack.js";
import { applyAwsCloudfrontOpennextFixes } from "../src/platforms/aws-cloudfront-opennext.js";
import { applyNextjsFixes } from "../src/fixers/nextjs.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "siteready-detect-"));
let n = 0;

async function layout(files) {
  const root = path.join(tmp, `case-${n++}`);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

const next = (extra = {}) => ({ dependencies: { next: "^16.0.0", ...extra } });

try {
  // Plain Next.js app, no signals: still the Vercel default.
  let root = await layout({ "package.json": next() });
  let s = await detectStack(root);
  assert.deepEqual([s.framework, s.platform, s.supported, s.siteRoot], ["nextjs", "vercel", true, root]);

  // vercel.json beats an OpenNext marker.
  root = await layout({ "package.json": next(), "vercel.json": "{}", "open-next.config.ts": "" });
  assert.equal((await detectStack(root)).platform, "vercel");

  // Single app with OpenNext config.
  root = await layout({ "package.json": next(), "open-next.config.ts": "" });
  assert.equal((await detectStack(root)).platform, "aws-cloudfront-opennext");

  // pnpm workspace, CDK dependency in a member package, pointed at the root.
  const pnpm = {
    "package.json": { private: true },
    "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "infra"\nother: x\n',
    "apps/web/package.json": next(),
    "infra/package.json": { dependencies: { "cdk-nextjs-standalone": "^4.0.0" } },
    "packages/ui/package.json": { dependencies: {} },
  };
  root = await layout(pnpm);
  s = await detectStack(root);
  assert.deepEqual([s.framework, s.platform, s.supported], ["nextjs", "aws-cloudfront-opennext", true]);
  assert.equal(s.siteRoot, path.join(root, "apps/web"));
  assert.equal(s.workspaceRoot, root);

  // Same workspace, pointed straight at the app dir: walks up for the signals.
  s = await detectStack(path.join(root, "apps/web"));
  assert.deepEqual([s.platform, s.siteRoot, s.workspaceRoot], ["aws-cloudfront-opennext", path.join(root, "apps/web"), root]);

  // npm workspaces (array form) with the infra package NOT a member, only a sibling dir.
  root = await layout({
    "package.json": { workspaces: ["apps/*"] },
    "apps/site/package.json": next(),
    "deploy/package.json": { devDependencies: { sst: "^3.0.0" } },
    "deploy/sst.config.ts": "",
  });
  s = await detectStack(root);
  assert.deepEqual([s.platform, s.siteRoot], ["aws-cloudfront-opennext", path.join(root, "apps/site")]);

  // Two framework apps: unsupported, candidates named, no guessing.
  root = await layout({
    "package.json": { workspaces: ["apps/*"] },
    "apps/a/package.json": next(),
    "apps/b/package.json": { dependencies: { astro: "^5.0.0" } },
  });
  s = await detectStack(root);
  assert.equal(s.supported, false);
  assert.match(s.reason, /more than one/);
  assert.match(s.reason, /apps[\\/]a/);

  // A .git boundary stops the upward search: a nested checkout doesn't inherit a parent workspace.
  root = await layout({
    "package.json": { workspaces: ["x/*"] },
    "x/app/.git/HEAD": "",
    "x/app/package.json": next(),
    "open-next.config.ts": "",
  });
  s = await detectStack(path.join(root, "x/app"));
  assert.equal(s.platform, "vercel");

  // Platform fixer: Next 16 gets proxy.js, Next 15 gets middleware.js, unknown version gets middleware.js.
  for (const [version, file] of [["^16.3.6", "proxy.js"], ["15.1.0", "middleware.js"], ["latest", "middleware.js"]]) {
    root = await layout({ "package.json": { dependencies: { next: version } } });
    const r = await applyAwsCloudfrontOpennextFixes(root);
    assert.deepEqual(r.written, [path.join(root, file)]);
    assert.ok(r.warnings.some((w) => /cache key/.test(w)) && r.warnings.some((w) => /public\//.test(w)));
  }

  // An existing TypeScript proxy is never overwritten (and nothing else is written).
  root = await layout({ "package.json": next(), "proxy.ts": "export function proxy() {}" });
  const r = await applyAwsCloudfrontOpennextFixes(root);
  assert.equal(r.written.length, 0);
  assert.equal(r.skipped.length, 1);
  assert.equal(await readFile(path.join(root, "proxy.ts"), "utf8"), "export function proxy() {}");

  // Next.js framework fixer: an i18n app's nested .tsx not-found and a robots metadata route are respected.
  root = await layout({ "package.json": next(), "app/[lang]/not-found.tsx": "", "app/robots.ts": "" });
  const f = await applyNextjsFixes(root);
  assert.ok(!f.written.some((p) => /not-found|robots/.test(p)));
  assert.ok(!existsSync(path.join(root, "app/not-found.js")) && !existsSync(path.join(root, "public/robots.txt")));

  console.log("OK: monorepo + AWS/OpenNext detection, platform fixer, and Next.js fixer skips verified.");
} finally {
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
