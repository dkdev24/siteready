import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { writeJsonAndMarkdown } from "./lib/write-report.js";

/**
 * Loads a report.json from either a direct file path or a directory
 * containing one (the shape `scan`/`rescan` write to `<outDir>/report.json`).
 */
export async function loadReport(reportPath) {
  const resolved = path.resolve(reportPath);
  if (!existsSync(resolved)) {
    throw new Error(`Report not found: ${resolved}`);
  }
  const filePath = statSync(resolved).isDirectory() ? path.join(resolved, "report.json") : resolved;
  if (!existsSync(filePath)) {
    throw new Error(`No report.json found at ${filePath}`);
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

/**
 * Diffs a baseline report against a re-scan report, scanner by scanner and
 * check by check — a before/after progression (0 -> 91 -> 96 -> 99 style),
 * not just a single score delta.
 */
export function buildDiffReport(baseline, rescan) {
  const scannerNames = [...new Set([...Object.keys(baseline.scanners ?? {}), ...Object.keys(rescan.scanners ?? {})])];

  const scanners = {};
  for (const name of scannerNames) {
    const before = baseline.scanners?.[name];
    const after = rescan.scanners?.[name];

    if (!before || !after || before.error || after.error) {
      scanners[name] = {
        comparable: false,
        reason: !before
          ? "not present in baseline report"
          : before.error
            ? `baseline scan failed: ${before.error}`
            : !after
              ? "not present in re-scan report"
              : `re-scan failed: ${after.error}`,
      };
      continue;
    }

    const beforeChecks = new Map(before.checks.map((c) => [c.id, c]));
    const afterChecks = new Map(after.checks.map((c) => [c.id, c]));
    const allIds = new Set([...beforeChecks.keys(), ...afterChecks.keys()]);

    const fixed = [];
    const regressed = [];
    const stillFailing = [];
    const newChecks = [];
    const removedChecks = [];

    for (const id of allIds) {
      const b = beforeChecks.get(id);
      const a = afterChecks.get(id);
      if (b && !a) {
        removedChecks.push({ id, status: b.status, message: b.message });
        continue;
      }
      if (!b && a) {
        newChecks.push({ id, status: a.status, message: a.message });
        continue;
      }
      const bPass = b.status === "pass";
      const aPass = a.status === "pass";
      if (!bPass && aPass) {
        fixed.push({ id, category: a.category, from: b.status, to: a.status, message: a.message });
      } else if (bPass && !aPass) {
        regressed.push({ id, category: a.category, from: b.status, to: a.status, message: a.message });
      } else if (!bPass && !aPass) {
        stillFailing.push({ id, category: a.category, status: a.status, message: a.message, fix: a.fix });
      }
    }

    scanners[name] = {
      comparable: true,
      score: before.score && after.score
        ? {
            before: before.score.overall,
            after: after.score.overall,
            delta: after.score.overall - before.score.overall,
            beforeGrade: before.score.grade,
            afterGrade: after.score.grade,
          }
        : null,
      fixed,
      regressed,
      stillFailing,
      newChecks,
      removedChecks,
    };
  }

  const baselineSiteType = baseline.siteType ?? "auto";
  const rescanSiteType = rescan.siteType ?? "auto";

  return {
    target: rescan.target ?? baseline.target,
    baselineGeneratedAt: baseline.generatedAt,
    rescanGeneratedAt: rescan.generatedAt,
    siteTypeMismatch:
      baselineSiteType !== rescanSiteType ? { baseline: baselineSiteType, rescan: rescanSiteType } : null,
    scanners,
  };
}

export function renderDiffMarkdown(diff) {
  const lines = [];
  lines.push(`# Agent Readiness Diff Report — ${diff.target}`);
  lines.push("");
  lines.push(`Baseline: ${diff.baselineGeneratedAt}  \nRe-scan: ${diff.rescanGeneratedAt}`);
  lines.push("");

  if (diff.siteTypeMismatch) {
    lines.push(
      `**Warning: site-type mismatch** — baseline was scanned as \`${diff.siteTypeMismatch.baseline}\`, ` +
        `re-scan as \`${diff.siteTypeMismatch.rescan}\`. Score deltas below may reflect the site-type ` +
        `change, not real fixes/regressions.`
    );
    lines.push("");
  }

  for (const [name, s] of Object.entries(diff.scanners)) {
    lines.push(`## Scanner: ${name}`);
    lines.push("");

    if (!s.comparable) {
      lines.push(`_Not comparable — ${s.reason}._`);
      lines.push("");
      continue;
    }

    if (s.score) {
      const sign = s.score.delta > 0 ? "+" : "";
      lines.push(
        `**Score: ${s.score.before} (${s.score.beforeGrade}) → ${s.score.after} (${s.score.afterGrade})** ` +
          `(${sign}${s.score.delta})`
      );
      lines.push("");
    }

    if (s.fixed.length) {
      lines.push(`### Fixed (${s.fixed.length})`);
      lines.push("");
      for (const c of s.fixed) lines.push(`- \`${c.id}\` (${c.category}): ${c.from} → ${c.to} — ${c.message}`);
      lines.push("");
    }

    if (s.regressed.length) {
      lines.push(`### Regressed (${s.regressed.length})`);
      lines.push("");
      for (const c of s.regressed) lines.push(`- \`${c.id}\` (${c.category}): ${c.from} → ${c.to} — ${c.message}`);
      lines.push("");
    }

    if (s.stillFailing.length) {
      lines.push(`### Still failing / backlog (${s.stillFailing.length})`);
      lines.push("");
      for (const c of s.stillFailing) {
        lines.push(`- **[${c.status.toUpperCase()}]** \`${c.id}\` (${c.category}) — ${c.message}`);
        if (c.fix) lines.push(`  - Fix: ${c.fix}`);
      }
      lines.push("");
    }

    if (!s.fixed.length && !s.regressed.length && !s.stillFailing.length) {
      lines.push("No check-level changes.");
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function writeDiffReport(outDir, diff) {
  await writeJsonAndMarkdown(outDir, "diff-report", diff, renderDiffMarkdown);
}
