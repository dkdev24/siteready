#!/usr/bin/env node
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { scanTarget, SUPPORTED_SCANNERS, DEFAULT_SCANNERS } from "./scan.js";
import { writeReport, writeRaw } from "./report.js";
import { loadReport, buildDiffReport, writeDiffReport } from "./diff-report.js";
import { enhance } from "./enhance.js";
import { openEnhancePr } from "./pr.js";
import { runLoop, runScanLocal } from "./loop.js";
import { buildCompareReport, writeCompareReport } from "./compare.js";
import { collectHistory, buildMonitorReport, writeMonitorReport } from "./monitor.js";
import { installSkill, SUPPORTED_AGENTS } from "./skill-install.js";

function failedScannerNames(report) {
  return Object.entries(report.scanners)
    .filter(([, s]) => s.error)
    .map(([name]) => name)
    .join(", ");
}

function parseFlags(argv, { defaults = {} } = {}) {
  const args = { ...defaults };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--out-root") args.outRoot = argv[++i];
    else if (a === "--sampling") args.sampling = argv[++i];
    else if (a === "--site-type") args.siteType = argv[++i];
    else if (a === "--scanners") args.scanners = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--baseline") args.baseline = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--pr") args.pr = true;
    else if (a === "--global") args.global = true;
    else if (a === "--force") args.force = true;
    else if (a === "--uninstall") args.uninstall = true;
    else if (a === "-h" || a === "--help") args.help = true;
    else positional.push(a);
  }

  args.positional = positional;
  return args;
}

function hostnameFor(target) {
  try {
    return new URL(target).hostname;
  } catch {
    return path.basename(path.resolve(target));
  }
}

function outDirFor(target, suffix = "") {
  return path.join("out", `${hostnameFor(target)}${suffix}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
}

function printHelp() {
  console.log(`Usage: siteready <url> [options]              scan + report
       siteready enhance <repo-path> [--pr]           apply fixer, optionally open a PR
       siteready rescan <url> --baseline <path> [options]   re-scan + diff vs a baseline report
       siteready diff-report <baseline> <rescan> [--out <dir>]   diff two existing reports
       siteready scan-local <repo-path> [options]      one local scan, no public URL needed (pre-deploy)
       siteready rescan-local <repo-path> --baseline <path> [options]   local re-scan + diff vs a baseline
       siteready loop <repo-path> [options]            scan-local -> enhance -> rescan-local, one shot
       siteready compare <url> <url> [<url> ...] [options]   scan N sites, render side by side
       siteready monitor <url> [--out-root <dir>] [--out <dir>]   score-over-time from past scans
       siteready install-skill <agent...> [--global] [--force] [--uninstall]   install SKILL.md for an agent

Options (scan / rescan / scan-local / rescan-local / loop):
  --out <dir>            Output directory (default: ./out/<hostname-or-dir>-<timestamp>)
  --sampling <strategy>   afdocs sampling strategy: random | deterministic | curated | none
                          (default: deterministic)
  --scanners <list>       Comma-separated scanner list (supported: ${SUPPORTED_SCANNERS.join(", ")})
                          (default: ${DEFAULT_SCANNERS.join(", ")} for scan/rescan — ora is opt-in,
                          since it's the same engine as is-agentic's full ranker and running both by
                          default just doubles the hosted-API cost for overlapping data; afdocs-only
                          for scan-local/rescan-local unless you opt in — see below)
  --port <n>              Local preview server port for scan-local/rescan-local (default: OS-assigned free port)
  --site-type <type>      content | api | application | auto (default: auto, unfiltered). Excludes
                          API-surface checks (openapi-spec, oauth-support, the Payments layer, etc.)
                          from a "content" site's score — see site-types.js and NEXT_ACTIONS.md #10.
                          Only excludes for "content"; "api"/"application" score everything, same as
                          "auto". rescan defaults to the baseline report's own site type unless
                          overridden; a mismatch prints a warning in the diff.

  AFDOCS_VERSION / IS_AGENTIC_VERSION env vars override those scanners' pinned CLI version for one
  run, no source edit needed. \`npm run check-scanner-versions\` reports when the pins are behind npm.

  Ora is a keyless public API but rate-limited per IP: 10 scans/minute burst, 30 per rolling 24h
  (6 of which may be force/cache-bypassing; siteready never forces). Responses from Ora's 6-hour
  freshness cache don't count against quota, so re-scanning one URL is usually free — scanning many
  distinct URLs is what exhausts it. Exceeding it returns HTTP 429 with a retry-after hint — a
  failing scanner no longer takes the whole scan down: the report is still written with that
  scanner recorded as \`{ error }\` (report.json's top-level \`partial: true\`, a "FAILED" section in
  report.md), scored from whichever scanners succeeded, and a warning printed. Limits:
  https://ora.ai/docs

enhance requires a local checkout of the target site's own repo (not just a URL) — its fixes are
source-file edits, so there's no way to apply them against a URL alone. Supports Astro (with or
without Starlight) + Cloudflare Pages, Next.js + Vercel, and Jekyll + GitHub Pages. It never commits
or pushes unless --pr is passed explicitly; without it, review the diff yourself.
  --pr    Commit the written files to a new branch, push, and open a PR via \`gh\` (requires a git
          remote + an authenticated \`gh\`). Falls back to "left as an unstaged diff" if either is
          missing — never fails the enhance step itself.

rescan re-runs the same scanners a baseline report used (override with --scanners) against a URL,
then writes a new report.json/report.md plus a diff-report.md/json comparing it to the baseline.

scan-local is a single baseline scan against a local repo checkout, no live deployment and no
existing report to diff against — for a site that hasn't been publicly deployed yet. Builds the
site, serves it locally (Cloudflare Pages via \`wrangler pages dev\`, or \`next start\` for Vercel),
scans it, writes report.json/report.md. Needs a platform \`startLocalServer\` can run
(cloudflare-pages or vercel) but not a fixer, so it also works on frameworks enhance doesn't support
yet.
  --scanners is-agentic,ora (or afdocs,is-agentic,ora) opens a Cloudflare Quick Tunnel (no account
          needed) to the local preview server so those hosted scanners can reach it — they run
          their own crawler on Vercel's/Ora's infrastructure, which can never reach localhost
          otherwise. The site is briefly reachable by anyone with the random tunnel URL, torn down
          right after the scan. Quick Tunnels are anonymous and best-effort, so an unreachable one
          is retried as a whole fresh tunnel (3 attempts; override with the SITEREADY_TUNNEL_ATTEMPTS
          env var). Reachability is confirmed by waiting for cloudflared's own "precheck complete"
          signal before probing, not by a fixed delay — two tunnels opened back-to-back (e.g. by
          \`loop\`) are no less reliable than one.

rescan-local is scan-local's counterpart to rescan: re-runs a baseline report's scanners (override
with --scanners) against a fresh local build, writes report.json/report.md plus a diff-report, no
live deployment. Use it after enhance to verify fixes locally before deploying — pairs with a
scan-local (or a public scan/rescan) baseline. Same Quick Tunnel behavior as scan-local for hosted
scanners.

loop chains scan-local -> enhance -> rescan-local into one command, no manual steps in between —
an opt-in single-shot convenience (e.g. a quick POC), not the default recommendation: running the
three as separate commands still lets you review the enhance diff before re-scanning. Writes
before/after reports under <out>/before and <out>/after plus a diff-report, same as running the
three commands by hand. Requires the same fixer-supported framework/platform pair enhance does
(unlike scan-local, which works on anything startLocalServer can serve).

compare scans each URL one at a time (not fanned out — Ora's rate limit is per IP) with the same
scanner set, writes each site's full report under \`<out>/<hostname>/\`, and renders a side-by-side
compare-report.md/json across all of them. Accepts the same --scanners/--sampling/--out as scan.

monitor reads every \`<out-root>/*/report.json\` written by past scan/rescan runs for the given
URL's hostname (no new scanning), sorts them oldest-first, and renders a score-over-time table plus
a regression flag using the same check-level fixed/regressed logic as diff-report. --out-root
defaults to ./out.

install-skill writes this package's own SKILL.md into an agent's skill-discovery path so it can
drive siteready without being told how: supported agents are ${SUPPORTED_AGENTS.join(", ")}.
\`claude\` gets a verbatim copy (Claude Code resolves the skill's own base directory itself at load
time); \`codex\`/\`opencode\` get a copy with the \`<skill-dir>\` placeholder baked in as this
installation's real absolute path, since neither documents an equivalent runtime signal — both
read the same .agents/skills/siteready/SKILL.md path, so installing one installs both.
  --global       Install to the user-level path (~/.claude/skills, ~/.agents/skills) instead of
                 the current project (./.claude/skills, ./.agents/skills).
  --force        Overwrite an existing install instead of skipping it.
  --uninstall    Remove the installed skill directory instead of writing it.`);
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
    siteType: args.siteType,
    onProgress: (msg) => console.log(msg),
  });

  for (const [name, raw] of Object.entries(rawByScanner)) {
    await writeRaw(outDir, name, raw);
  }
  await writeReport(outDir, report);

  if (report.partial) {
    console.warn(`\nWarning: partial scan — ${failedScannerNames(report)} failed and were excluded from scoring.`);
  }
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
  // Defaults to the baseline's own site type so a plain `rescan` (no
  // --site-type) can't silently drift into a mismatch — see diff-report.js's
  // siteTypeMismatch warning for when it's overridden anyway.
  const siteType = args.siteType ?? baseline.siteType;

  console.log(`Re-scanning ${target} with: ${scanners.join(", ")} (baseline: ${args.baseline})`);
  const { report, rawByScanner } = await scanTarget(target, scanners, {
    sampling: args.sampling ?? "deterministic",
    siteType,
    onProgress: (msg) => console.log(msg),
  });

  for (const [name, raw] of Object.entries(rawByScanner)) {
    await writeRaw(outDir, name, raw);
  }
  await writeReport(outDir, report);

  const diff = buildDiffReport(baseline, report);
  await writeDiffReport(outDir, diff);

  if (report.partial) {
    console.warn(`\nWarning: partial re-scan — ${failedScannerNames(report)} failed and were excluded from scoring.`);
  }
  if (diff.siteTypeMismatch) {
    console.warn(
      `\nWarning: site-type mismatch — baseline was \`${diff.siteTypeMismatch.baseline}\`, this re-scan is \`${diff.siteTypeMismatch.rescan}\`.`
    );
  }
  console.log(`\nReport written to ${outDir}/report.md`);
  console.log(`Diff vs baseline written to ${outDir}/diff-report.md`);
  for (const [name, s] of Object.entries(diff.scanners)) {
    if (s.comparable && s.score) {
      const sign = s.score.delta > 0 ? "+" : "";
      console.log(`  ${name}: ${s.score.before} -> ${s.score.after} (${sign}${s.score.delta})`);
    }
  }
}

async function runCompareCommand(targets, args) {
  if (targets.length < 2) {
    console.error("Usage: siteready compare <url> <url> [<url> ...] [options]");
    process.exit(1);
  }

  const scanners = args.scanners ?? DEFAULT_SCANNERS;
  const unsupported = scanners.filter((s) => !SUPPORTED_SCANNERS.includes(s));
  if (unsupported.length) {
    console.error(`Unsupported scanner(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_SCANNERS.join(", ")}`);
    process.exit(1);
  }

  const outDir = args.out ?? path.join("out", `compare-${new Date().toISOString().replace(/[:.]/g, "-")}`);

  // Scanned one at a time, not fanned out — Ora's rate limit (10/min, 30/day)
  // is per IP, so N concurrent scans against N distinct hosts would burn
  // through it fast. See NEXT_ACTIONS.md #14.
  const sites = [];
  for (const target of targets) {
    console.log(`Scanning ${target} with: ${scanners.join(", ")}`);
    const { report, rawByScanner } = await scanTarget(target, scanners, {
      sampling: args.sampling ?? "deterministic",
      siteType: args.siteType,
      onProgress: (msg) => console.log(`  ${msg}`),
    });

    const siteDir = path.join(outDir, hostnameFor(target));
    for (const [name, raw] of Object.entries(rawByScanner)) {
      await writeRaw(siteDir, name, raw);
    }
    await writeReport(siteDir, report);
    if (report.partial) {
      console.warn(`  Warning: partial scan for ${target} — ${failedScannerNames(report)} failed.`);
    }
    sites.push({ target, report });
  }

  const compare = buildCompareReport(sites);
  await writeCompareReport(outDir, compare);

  console.log(`\nComparison written to ${outDir}/compare-report.md (and compare-report.json)`);
}

async function runMonitorCommand(target, args) {
  if (!target) {
    console.error("Usage: siteready monitor <url> [--out-root <dir>] [--out <dir>]");
    process.exit(1);
  }

  const outRoot = args.outRoot ?? "out";
  const history = await collectHistory(outRoot, target);
  const monitor = buildMonitorReport(target, history);

  const outDir = args.out ?? path.join(outRoot, `monitor-${hostnameFor(target)}`);
  await writeMonitorReport(outDir, monitor);

  console.log(`${monitor.scans} scan(s) found for ${target}.`);
  console.log(`Monitor report written to ${outDir}/monitor-report.md (and monitor-report.json)`);
  if (monitor.regressions.length) {
    console.warn(`Warning: ${monitor.regressions.length} regression(s) detected between scans — see ${outDir}/monitor-report.md`);
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

  const unsupported = (args.scanners ?? ["afdocs"]).filter((s) => !SUPPORTED_SCANNERS.includes(s));
  if (unsupported.length) {
    console.error(`Unsupported scanner(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_SCANNERS.join(", ")}`);
    process.exit(1);
  }

  const scanners = args.scanners ?? ["afdocs"];
  const outDir = args.out ?? outDirFor(repoPath, "-loop");

  console.log(`Running full loop on ${path.resolve(repoPath)} with: ${scanners.join(", ")}`);
  const { stack, enhanceResult, baseline, baselineRaw, rescan, rescanRaw, diff } = await runLoop(repoPath, {
    scanners,
    sampling: args.sampling ?? "deterministic",
    siteType: args.siteType,
    port: args.port,
    onProgress: (msg) => console.log(msg),
  });

  console.log(`\nDetected: ${stack.framework} + ${stack.platform}`);
  if (enhanceResult.written.length) {
    console.log("Wrote:");
    for (const f of enhanceResult.written) console.log(`  + ${f}`);
  } else {
    console.log("Wrote nothing (already applied).");
  }
  if (enhanceResult.warnings.length) {
    console.log("Warnings:");
    for (const w of enhanceResult.warnings) console.log(`  ! ${w}`);
  }

  for (const [name, raw] of Object.entries(baselineRaw)) await writeRaw(path.join(outDir, "before"), name, raw);
  for (const [name, raw] of Object.entries(rescanRaw)) await writeRaw(path.join(outDir, "after"), name, raw);
  await writeReport(path.join(outDir, "before"), baseline);
  await writeReport(path.join(outDir, "after"), rescan);
  await writeDiffReport(outDir, diff);

  if (baseline.partial || rescan.partial) {
    console.warn(
      `\nWarning: partial scan — ${failedScannerNames(baseline.partial ? baseline : rescan)} failed and were excluded from scoring.`
    );
  }
  console.log(`\nBefore/after reports written under ${outDir}/before and ${outDir}/after`);
  console.log(`Diff report written to ${outDir}/diff-report.md`);
  for (const [name, s] of Object.entries(diff.scanners)) {
    if (s.comparable && s.score) {
      const sign = s.score.delta > 0 ? "+" : "";
      console.log(`  ${name}: ${s.score.before} -> ${s.score.after} (${sign}${s.score.delta})`);
    }
  }
}

async function runScanLocalCommand(repoPath, args) {
  if (!repoPath) {
    console.error("Usage: siteready scan-local <repo-path> [options]");
    process.exit(1);
  }

  const unsupported = (args.scanners ?? ["afdocs"]).filter((s) => !SUPPORTED_SCANNERS.includes(s));
  if (unsupported.length) {
    console.error(`Unsupported scanner(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_SCANNERS.join(", ")}`);
    process.exit(1);
  }

  const scanners = args.scanners ?? ["afdocs"];
  const outDir = args.out ?? outDirFor(repoPath, "-local");

  console.log(`Scanning local build of ${path.resolve(repoPath)} with: ${scanners.join(", ")}`);
  const { stack, report, rawByScanner } = await runScanLocal(repoPath, {
    scanners,
    sampling: args.sampling ?? "deterministic",
    siteType: args.siteType,
    port: args.port,
    onProgress: (msg) => console.log(msg),
  });

  console.log(`\nDetected: ${stack.framework} + ${stack.platform}`);

  for (const [name, raw] of Object.entries(rawByScanner)) {
    await writeRaw(outDir, name, raw);
  }
  await writeReport(outDir, report);

  if (report.partial) {
    console.warn(`\nWarning: partial scan — ${failedScannerNames(report)} failed and were excluded from scoring.`);
  }
  console.log(`\nReport written to ${outDir}/report.md (and report.json)`);
}

async function runRescanLocalCommand(repoPath, args) {
  if (!repoPath || !args.baseline) {
    console.error("Usage: siteready rescan-local <repo-path> --baseline <path-to-report-or-dir> [options]");
    process.exit(1);
  }

  const baseline = await loadReport(args.baseline);
  const scanners = args.scanners ?? Object.keys(baseline.scanners ?? {});
  if (!scanners.length) {
    console.error(`Baseline report at ${args.baseline} has no scanners to re-run. Pass --scanners explicitly.`);
    process.exit(1);
  }

  const outDir = args.out ?? outDirFor(repoPath, "-rescan-local");
  const siteType = args.siteType ?? baseline.siteType;

  console.log(`Re-scanning local build of ${path.resolve(repoPath)} with: ${scanners.join(", ")} (baseline: ${args.baseline})`);
  const { stack, report, rawByScanner } = await runScanLocal(repoPath, {
    scanners,
    sampling: args.sampling ?? "deterministic",
    siteType,
    port: args.port,
    onProgress: (msg) => console.log(msg),
  });

  console.log(`\nDetected: ${stack.framework} + ${stack.platform}`);

  for (const [name, raw] of Object.entries(rawByScanner)) {
    await writeRaw(outDir, name, raw);
  }
  await writeReport(outDir, report);

  const diff = buildDiffReport(baseline, report);
  await writeDiffReport(outDir, diff);

  if (report.partial) {
    console.warn(`\nWarning: partial re-scan — ${failedScannerNames(report)} failed and were excluded from scoring.`);
  }
  if (diff.siteTypeMismatch) {
    console.warn(
      `\nWarning: site-type mismatch — baseline was \`${diff.siteTypeMismatch.baseline}\`, this re-scan is \`${diff.siteTypeMismatch.rescan}\`.`
    );
  }
  console.log(`\nReport written to ${outDir}/report.md`);
  console.log(`Diff vs baseline written to ${outDir}/diff-report.md`);
  for (const [name, s] of Object.entries(diff.scanners)) {
    if (s.comparable && s.score) {
      const sign = s.score.delta > 0 ? "+" : "";
      console.log(`  ${name}: ${s.score.before} -> ${s.score.after} (${sign}${s.score.delta})`);
    }
  }
}

async function runInstallSkillCommand(agents, args) {
  if (!agents.length) {
    console.error(`Usage: siteready install-skill <agent...> [--global] [--force] [--uninstall]`);
    console.error(`Supported agents: ${SUPPORTED_AGENTS.join(", ")}`);
    process.exit(1);
  }

  const results = await installSkill(agents, { global: args.global, force: args.force, uninstall: args.uninstall });

  for (const result of results) {
    console.log(`\n${result.agent}:`);
    for (const f of result.written) console.log(`  + ${f}`);
    for (const f of result.skipped) console.log(`  - ${f}`);
    for (const f of result.removed) console.log(`  x ${f}`);
    for (const w of result.warnings) console.log(`  ! ${w}`);
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

  if (command === "scan-local") {
    const args = parseFlags(argv.slice(2));
    await runScanLocalCommand(argv[1], args);
    return;
  }

  if (command === "rescan-local") {
    const args = parseFlags(argv.slice(2));
    await runRescanLocalCommand(argv[1], args);
    return;
  }

  if (command === "loop") {
    const args = parseFlags(argv.slice(2));
    await runLoopCommand(argv[1], args);
    return;
  }

  if (command === "compare") {
    const rawArgv = argv.slice(1);
    const flagStart = rawArgv.findIndex((a) => a.startsWith("--"));
    const targets = flagStart === -1 ? rawArgv : rawArgv.slice(0, flagStart);
    const args = parseFlags(flagStart === -1 ? [] : rawArgv.slice(flagStart));
    await runCompareCommand(targets, args);
    return;
  }

  if (command === "monitor") {
    const args = parseFlags(argv.slice(2));
    await runMonitorCommand(argv[1], args);
    return;
  }

  if (command === "install-skill") {
    const rawArgv = argv.slice(1);
    const flagStart = rawArgv.findIndex((a) => a.startsWith("--"));
    const agents = flagStart === -1 ? rawArgv : rawArgv.slice(0, flagStart);
    const args = parseFlags(flagStart === -1 ? [] : rawArgv.slice(flagStart));
    await runInstallSkillCommand(agents, args);
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
