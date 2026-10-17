#!/usr/bin/env node
// Strips each reference fixture back to its pre-fixer state in a temp copy,
// runs a local scan-local -> enhance -> rescan-local cycle against it, and
// asserts the fixer produced a real, verifiable improvement. This is the
// "does the release loop actually work" check — syntax-checking
// (scripts/check-syntax.js) only proves the code parses. Uses afdocs only,
// so no Cloudflare Quick Tunnel is ever involved here.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScanLocal } from "../src/loop.js";
import { enhance } from "../src/enhance.js";
import { buildDiffReport } from "../src/diff-report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function removeIfPresent(dir, relPaths) {
  for (const rel of relPaths) {
    await rm(path.join(dir, rel), { recursive: true, force: true });
  }
}

// Removes the `postbuild` hook the nextjs fixer adds, so a stripped copy is back to "before".
async function removePostbuild(dir, rel = "package.json") {
  const file = path.join(dir, rel);
  const pkg = JSON.parse(await readFile(file, "utf8"));
  delete pkg.scripts.postbuild;
  await writeFile(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

function checkStatus(report, id) {
  return report?.checks?.find((c) => c.id === id)?.status ?? null;
}

const FIXTURES = [
  {
    name: "astro-starlight-cf-pages",
    dir: path.join(__dirname, "..", "fixtures", "astro-starlight-cf-pages"),
    async strip(dir) {
      await removeIfPresent(dir, [
        "src/lib/llms-index.ts",
        "src/lib/lastmod.ts",
        "src/pages/llms.txt.ts",
        "src/pages/llms-full.txt.ts",
        "src/pages/[section]",
        "src/pages/[...slug].md.ts",
        "src/pages/robots.txt.ts",
        "src/pages/schema-map.xml.ts",
        "src/pages/schema-feed.jsonl.ts",
        "src/components/Banner.astro",
        "src/components/Head.astro",
        "src/content/docs/404.md",
        "functions",
      ]);

      const configPath = path.join(dir, "astro.config.mjs");
      const source = await readFile(configPath, "utf8");
      // \r?\n, not \n: git on Windows checks this file out with CRLF, and a
      // strict \n match here silently fails to strip the Banner/Head registration —
      // caught by CI (windows-latest) leaving a dangling import to a file this
      // function had just deleted.
      let stripped = source.replace(/\r?\n\s*Head:\s*'\.\/src\/components\/Head\.astro',/, "");
      stripped = stripped.replace(
        /\r?\n\s*components:\s*\{\r?\n\s*Banner:\s*'\.\/src\/components\/Banner\.astro',\r?\n\s*\},/,
        ""
      );
      if (stripped === source) {
        throw new Error(`Failed to strip the Banner/Head registration from ${configPath} — check the regex against its current content.`);
      }
      await writeFile(configPath, stripped, "utf8");
    },
    // astro-starlight.js generates a content-aware llms.txt + markdown mirrors,
    // so afdocs' overall score is expected to move a lot.
    async verify({ baseline, rescan }) {
      const before = baseline.scanners.afdocs?.score?.overall ?? null;
      const after = rescan.scanners.afdocs?.score?.overall ?? null;
      console.log(`afdocs score: ${before} -> ${after}`);

      if (before === null || after === null) {
        throw new Error("Missing afdocs score in baseline or rescan report.");
      }
      if (!(after > before)) {
        throw new Error(`Expected the score to improve after enhance (before=${before}, after=${after}).`);
      }
      if (after < 80) {
        throw new Error(`Expected a strong post-fix score (>=80), got ${after}.`);
      }
    },
  },
  {
    name: "astro-cf-pages",
    dir: path.join(__dirname, "..", "fixtures", "astro-cf-pages"),
    async strip(dir) {
      await removeIfPresent(dir, ["src/pages/404.astro", "public/robots.txt", "src/utils/smartquotes.ts", "functions"]);
    },
    // astro.js (plain Astro, no Starlight) deliberately never writes an
    // llms.txt — afdocs gates its *overall* score on llms.txt existing, so
    // that number stays 0 before and after regardless of this fixer's fixes
    // (confirmed by hand: only content-discoverability checks fail/pass
    // differently around llms.txt; every other category comes back `null`
    // in categoryScores whenever llms.txt is missing). Assert on the
    // individual checks this fixer actually targets instead of the gated
    // overall score. (markdown-url-support isn't in this list — the fixture's
    // .md mirror routes are pre-existing site content, not something this
    // fixer creates, so that check already passes pre-enhance.)
    async verify({ baseline, rescan, enhanceResult }) {
      const targetChecks = ["http-status-codes", "content-negotiation"];
      for (const id of targetChecks) {
        const before = checkStatus(baseline.scanners.afdocs, id);
        const after = checkStatus(rescan.scanners.afdocs, id);
        console.log(`afdocs check ${id}: ${before} -> ${after}`);
        if (before !== "fail") {
          throw new Error(`Expected baseline check ${id} to fail pre-enhance, got ${before}.`);
        }
        if (after !== "pass") {
          throw new Error(`Expected check ${id} to pass post-enhance, got ${after}.`);
        }
      }

      if (enhanceResult.warnings.length === 0) {
        throw new Error(
          "Expected enhance to warn about the unwired smartQuotes() util for the fixture's raw-body markdown-mirror routes."
        );
      }
    },
  },
  {
    name: "nextjs-vercel",
    dir: path.join(__dirname, "..", "fixtures", "nextjs-vercel"),
    async strip(dir) {
      await removeIfPresent(dir, ["app/not-found.js", "public/robots.txt", "proxy.js", "scripts", "public/llms.txt"]);
      await removePostbuild(dir);
    },
    // Same afdocs overall-score gating as the Astro fixtures (see
    // astro-cf-pages/README.md) — nextjs.js never writes llms.txt either, so
    // assert on the individual check this fixer pair actually targets.
    // http-status-codes isn't asserted here — Next.js's own built-in 404
    // fallback already returns a real 404 with no fixer involved, so that
    // check passes before and after; only content-negotiation moves.
    async verify({ baseline, rescan, dir }) {
      const before = checkStatus(baseline.scanners.afdocs, "content-negotiation");
      const after = checkStatus(rescan.scanners.afdocs, "content-negotiation");
      console.log(`afdocs check content-negotiation: ${before} -> ${after}`);
      if (before !== "fail") {
        throw new Error(`Expected baseline content-negotiation to fail pre-enhance, got ${before}.`);
      }
      if (after !== "pass") {
        throw new Error(`Expected content-negotiation to pass post-enhance, got ${after}.`);
      }
      // This fixture commits its own .md siblings: the generator must leave them
      // byte-identical (it only replaces files it wrote), and still add llms.txt.
      const source = path.join(__dirname, "..", "fixtures", "nextjs-vercel", "public");
      for (const rel of ["index.md", "about.md", "posts/hello-world.md", "posts/second-post.md"]) {
        const [orig, now] = await Promise.all([readFile(path.join(source, rel), "utf8"), readFile(path.join(dir, "public", rel), "utf8")]);
        if (orig !== now) throw new Error(`The generator changed the committed ${rel}; it must only replace files it wrote.`);
      }
      if (!existsSync(path.join(dir, "public", "llms.txt"))) throw new Error("Expected the generator to write public/llms.txt.");
    },
  },
  {
    name: "nextjs-opennext-monorepo",
    dir: path.join(__dirname, "..", "fixtures", "nextjs-opennext-monorepo"),
    // Fixer targets live in the monorepo's app package, not the repo root. This
    // fixture ships no .md siblings: the generator has to produce them.
    async strip(dir) {
      await removeIfPresent(dir, ["apps/web/app/not-found.js", "apps/web/public/robots.txt", "apps/web/proxy.js", "apps/web/scripts"]);
      await removePostbuild(dir, "apps/web/package.json");
    },
    // Proves siteRoot wiring (install/build/start ran from apps/web), that the
    // fixer wrote into the app package rather than the workspace root, and that
    // the postbuild generator + proxy turn three failing afdocs checks into passes.
    async verify({ baseline, rescan, enhanceResult }) {
      if (enhanceResult.stack.platform !== "aws-cloudfront-opennext") {
        throw new Error(`Expected platform aws-cloudfront-opennext, detected ${enhanceResult.stack.platform}.`);
      }
      if (!enhanceResult.written.every((f) => f.includes(`apps${path.sep}web${path.sep}`))) {
        throw new Error(`Expected every fix under apps/web, got: ${enhanceResult.written.join(", ")}`);
      }
      for (const id of ["llms-txt-exists", "markdown-url-support", "content-negotiation"]) {
        const before = checkStatus(baseline.scanners.afdocs, id);
        const after = checkStatus(rescan.scanners.afdocs, id);
        console.log(`afdocs check ${id}: ${before} -> ${after}`);
        if (before !== "fail") throw new Error(`Expected baseline ${id} to fail pre-enhance, got ${before}.`);
        if (after !== "pass") throw new Error(`Expected ${id} to pass post-enhance, got ${after}.`);
      }
    },
  },
];

async function runFixture(fixture) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `siteready-verify-loop-${fixture.name}-`));
  const target = path.join(tmpDir, "fixture");

  try {
    await cp(fixture.dir, target, { recursive: true });
    await fixture.strip(target);

    console.log(`\n=== ${fixture.name}: running scan-local -> enhance -> rescan-local against stripped fixture copy at ${target} ===`);
    const scanOpts = { scanners: ["afdocs", "agent-headers"], sampling: "deterministic", onProgress: (msg) => console.log(msg) };
    const { report: baseline } = await runScanLocal(target, scanOpts);
    const enhanceResult = await enhance(target);
    const { report: rescan } = await runScanLocal(target, scanOpts);
    buildDiffReport(baseline, rescan); // exercised here too, same as a real rescan-local run

    await fixture.verify({ baseline, rescan, enhanceResult, dir: target });
    // The middleware enhance writes must never serve agents worse than a plain request.
    const agentFailures = (rescan.scanners["agent-headers"]?.checks ?? []).filter((c) => c.status === "fail");
    if (agentFailures.length) {
      throw new Error(`${fixture.name}: agent-headers failed after enhance: ${agentFailures.map((c) => c.message).join(" | ")}`);
    }
    console.log(`OK: ${fixture.name} verified.`);
  } finally {
    // Windows can keep a handle open for a moment after the preview server's
    // process tree is killed, so the first rmdir fails with EBUSY; retry.
    await rm(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}

async function main() {
  // Optional filter: `node scripts/verify-loop.js <fixture-name>` runs one fixture.
  const only = process.argv[2];
  for (const fixture of FIXTURES.filter((f) => !only || f.name === only)) {
    await runFixture(fixture);
  }
  console.log("\nOK: scan-local -> enhance -> rescan-local verified for all fixtures — enhance produces real, verifiable improvements.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
