#!/usr/bin/env node
// Strips this repo's own reference fixture back to its pre-fixer state in a
// temp copy, runs the full local `loop` against it, and asserts a real score
// improvement. This is the "does the release loop actually work" check —
// syntax-checking (scripts/check-syntax.js) only proves the code parses.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLoop } from "../src/loop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "..", "examples", "astro-starlight-cf-pages");

async function stripFixerOutput(dir) {
  const filesToRemove = [
    "src/pages/llms.txt.ts",
    "src/pages/[...slug].md.ts",
    "src/components/Banner.astro",
    "functions/_middleware.js",
  ];
  for (const rel of filesToRemove) {
    const p = path.join(dir, rel);
    if (existsSync(p)) await rm(p, { force: true });
  }
  await rm(path.join(dir, "functions"), { recursive: true, force: true });

  const configPath = path.join(dir, "astro.config.mjs");
  const source = await readFile(configPath, "utf8");
  // \r?\n, not \n: git on Windows checks this file out with CRLF, and a
  // strict \n match here silently fails to strip the Banner registration —
  // caught by CI (windows-latest) leaving a dangling import to a file this
  // function had just deleted.
  const stripped = source.replace(
    /\r?\n\s*components:\s*\{\r?\n\s*Banner:\s*'\.\/src\/components\/Banner\.astro',\r?\n\s*\},/,
    ""
  );
  if (stripped === source) {
    throw new Error(`Failed to strip the Banner registration from ${configPath} — check the regex against its current content.`);
  }
  await writeFile(configPath, stripped, "utf8");
}

async function main() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "siteready-verify-loop-"));
  const target = path.join(tmpDir, "fixture");

  try {
    await cp(FIXTURE, target, { recursive: true });
    await stripFixerOutput(target);

    console.log(`Running loop against a stripped fixture copy at ${target}...`);
    const { baseline, rescan } = await runLoop(target, {
      scanners: ["afdocs"],
      sampling: "deterministic",
      onProgress: (msg) => console.log(msg),
    });

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

    console.log("OK: loop verified — enhance produced a real score improvement.");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
