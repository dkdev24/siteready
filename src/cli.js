#!/usr/bin/env node
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { scanTarget, SUPPORTED_SCANNERS, DEFAULT_SCANNERS } from "./scan.js";
import { writeReport, writeRaw } from "./report.js";
import { loadReport, buildDiffReport, writeDiffReport } from "./diff-report.js";
import { enhance } from "./enhance.js";
import { openEnhancePr } from "./pr.js";
import { runLoop } from "./loop.js";

function parseFlags(argv, { defaults = {} } = {}) {
  const args = { ...defaults };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--sampling") args.sampling = argv[++i];
    else if (a === "--scanners") args.scanners = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--baseline") args.baseline = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--pr") args.pr = true;
    else if (a === "-h" || a === "--help") args.help = true;
    else positional.push(a);
  }

  args.positional = positional;
  return args;
}

function outDirFor(target, suffix = "") {
  const hostname = (() => {
    try {
      return new URL(target).hostname;
    } catch {
      return path.basename(path.resolve(target));
    }
  })();
  return path.join("out", `${hostname}${suffix}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
}

function printHelp() {
  console.log(`Usage: siteready <url> [options]              scan + report
       siteready enhance <repo-path> [--pr]           apply fixer, optionally open a PR
       siteready rescan <url> --baseline <path> [options]   re-scan + diff vs a baseline report
       siteready diff-report <baseline> <rescan> [--out <dir>]   diff two existing reports
       siteready loop <repo-path> [options]            scan -> enhance -> rescan -> diff, local only

Options (scan / rescan / loop):
  --out <dir>            Output directory (default: ./out/<hostname-or-dir>-<timestamp>)
  --sampling <strategy>   afdocs sampling strategy: random | deterministic | curated | none
                          (default: deterministic)
  --scanners <list>       Comma-separated scanner list (supported: ${SUPPORTED_SCANNERS.join(", ")})
                          (default: ${DEFAULT_SCANNERS.join(", ")} for scan/rescan — ora is opt-in,
                          since it's the same engine as is-agentic's full ranker and running both by
                          default just doubles the hosted-API cost for overlapping data; afdocs-only
                          for loop, since is-agentic and ora are hosted services that can't reach a
                          local preview server)
  --port <n>              Local preview server port for loop (default: OS-assigned free port)

  AFDOCS_VERSION / IS_AGENTIC_VERSION env vars override those scanners' pinned CLI version for one
  run, no source edit needed. \`npm run check-scanner-versions\` reports when the pins are behind npm.

enhance requires a local checkout of the target site's own repo (not just a URL) — its fixes are
source-file edits, so there's no way to apply them against a URL alone. Supports one fixer: Astro +
Starlight + Cloudflare Pages. It never commits or pushes unless --pr is passed explicitly; without
it, review the diff yourself.
  --pr    Commit the written files to a new branch, push, and open a PR via \`gh\` (requires a git
          remote + an authenticated \`gh\`). Falls back to "left as an unstaged diff" if either is
          missing — never fails the enhance step itself.

rescan re-runs the same scanners a baseline report used (override with --scanners) against a URL,
then writes a new report.json/report.md plus a diff-report.md/json comparing it to the baseline.

loop runs the whole scan -> enhance -> rescan -> diff-report cycle against a local repo checkout
with no live deployment: builds the site, serves it locally (Cloudflare Pages via
\`wrangler pages dev\`), scans it, applies the fixer, rebuilds, re-serves, re-scans, and writes a
diff report — no manual steps, no live deployment.`);
}

async function runScanCommand(target, args) {
  const unsupported = (args.scanners ?? DEFAULT_SCANNERS).filter((s) => !SUPPORTED_SCANNERS.includes(s));
  if (unsupported.length) {
    console.error(`Unsupported scanner(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_SCANNERS.join(", ")}`);
    process.exit(1);
  }

  const scanners = args.scanners ?? DEFAULT_SCANNERS;
  const outDir = args.out ?? outDirFor(target);

  console.log(`Scanning ${target} with: ${scanners.join(", ")}`);
  const { report, rawByScanner } = await scanTarget(target, scanners, {
    sampling: args.sampling ?? "deterministic",
    onProgress: (msg) => console.log(msg),
  });

  for (const [name, raw] of Object.entries(rawByScanner)) {
    await writeRaw(outDir, name, raw);
  }
  await writeReport(outDir, report);

  console.log(`\nReport written to ${outDir}/report.md (and report.json)`);
}

async function runRescanCommand(target, args) {
  if (!target || !args.baseline) {
    console.error("Usage: siteready rescan <url> --baseline <path-to-report-or-dir> [options]");
    process.exit(1);
  }

  const baseline = await loadReport(args.baseline);
  const scanners = args.scanners ?? Object.keys(baseline.scanners ?? {});
  if (!scanners.length) {
    console.error(`Baseline report at ${args.baseline} has no scanners to re-run. Pass --scanners explicitly.`);
    process.exit(1);
  }

  const outDir = args.out ?? outDirFor(target, "-rescan");

  console.log(`Re-scanning ${target} with: ${scanners.join(", ")} (baseline: ${args.baseline})`);
  const { report, rawByScanner } = await scanTarget(target, scanners, {
    sampling: args.sampling ?? "deterministic",
    onProgress: (msg) => console.log(msg),
  });

  for (const [name, raw] of Object.entries(rawByScanner)) {
    await writeRaw(outDir, name, raw);
  }
  await writeReport(outDir, report);

  const diff = buildDiffReport(baseline, report);
  await writeDiffReport(outDir, diff);

  console.log(`\nReport written to ${outDir}/report.md`);
  console.log(`Diff vs baseline written to ${outDir}/diff-report.md`);
  for (const [name, s] of Object.entries(diff.scanners)) {
    if (s.comparable && s.score) {
      const sign = s.score.delta > 0 ? "+" : "";
      console.log(`  ${name}: ${s.score.before} -> ${s.score.after} (${sign}${s.score.delta})`);
    }
  }
}

async function runDiffReportCommand(baselinePath, rescanPath, args) {
  if (!baselinePath || !rescanPath) {
    console.error("Usage: siteready diff-report <baseline-report> <rescan-report> [--out <dir>]");
    process.exit(1);
  }

  const baseline = await loadReport(baselinePath);
  const rescan = await loadReport(rescanPath);
  const diff = buildDiffReport(baseline, rescan);

  const outDir = args.out ?? ".";
  await mkdir(outDir, { recursive: true });
  await writeDiffReport(outDir, diff);

  console.log(`Diff report written to ${path.join(outDir, "diff-report.md")}`);
}

async function runEnhanceCommand(repoPath, args) {
  if (!repoPath) {
    printHelp();
    process.exit(1);
  }

  console.log(`Enhancing ${path.resolve(repoPath)}...`);
  const result = await enhance(repoPath);
  console.log(`Detected: ${result.stack.framework} + ${result.stack.platform}`);

  if (result.written.length) {
    console.log("\nWrote:");
    for (const f of result.written) console.log(`  + ${f}`);
  }
  if (result.skipped.length) {
    console.log("\nSkipped (already present):");
    for (const f of result.skipped) console.log(`  - ${f}`);
  }
  if (result.warnings.length) {
    console.log("\nWarnings:");
    for (const w of result.warnings) console.log(`  ! ${w}`);
  }

  if (args.pr) {
    const prResult = await openEnhancePr(path.resolve(repoPath), {
      framework: result.stack.framework,
      platform: result.stack.platform,
      written: result.written,
    });
    if (prResult.opened) {
      console.log(`\nOpened PR from branch ${prResult.branch}: ${prResult.url}`);
    } else {
      console.log(`\nNo PR opened: ${prResult.reason}`);
    }
  } else {
    console.log("\nNo commits made. Review the diff (git diff / git status) before committing.");
  }
}

async function runLoopCommand(repoPath, args) {
  if (!repoPath) {
    console.error("Usage: siteready loop <repo-path> [options]");
    process.exit(1);
  }

  const scanners = args.scanners ?? ["afdocs"];
  const outDir = args.out ?? outDirFor(repoPath, "-loop");

  console.log(`Running full loop on ${path.resolve(repoPath)} with: ${scanners.join(", ")}`);
  const { stack, enhanceResult, baseline, rescan, diff } = await runLoop(repoPath, {
    scanners,
    sampling: args.sampling ?? "deterministic",
    port: args.port,
    onProgress: (msg) => console.log(msg),
  });

  console.log(`\nDetected: ${stack.framework} + ${stack.platform}`);
  console.log(enhanceResult.written.length ? `Wrote: ${enhanceResult.written.join(", ")}` : "Wrote nothing (already applied).");

  await writeReport(path.join(outDir, "before"), baseline);
  await writeReport(path.join(outDir, "after"), rescan);
  await writeDiffReport(outDir, diff);

  console.log(`\nBefore/after reports written under ${outDir}/before and ${outDir}/after`);
  console.log(`Diff report written to ${outDir}/diff-report.md`);
  for (const [name, s] of Object.entries(diff.scanners)) {
    if (s.comparable && s.score) {
      const sign = s.score.delta > 0 ? "+" : "";
      console.log(`  ${name}: ${s.score.before} -> ${s.score.after} (${sign}${s.score.delta})`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === "enhance") {
    const args = parseFlags(argv.slice(2));
    await runEnhanceCommand(argv[1], args);
    return;
  }

  if (command === "rescan") {
    const args = parseFlags(argv.slice(2));
    await runRescanCommand(argv[1], args);
    return;
  }

  if (command === "diff-report") {
    const args = parseFlags(argv.slice(3));
    await runDiffReportCommand(argv[1], argv[2], args);
    return;
  }

  if (command === "loop") {
    const args = parseFlags(argv.slice(2));
    await runLoopCommand(argv[1], args);
    return;
  }

  const args = parseFlags(argv, { defaults: { sampling: "deterministic" } });
  if (args.help || !args.positional[0]) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  await runScanCommand(args.positional[0], args);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
