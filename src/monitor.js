import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadReport, buildDiffReport } from "./diff-report.js";
import { writeJsonAndMarkdown } from "./lib/write-report.js";

function hostnameFor(target) {
  try {
    return new URL(target).hostname;
  } catch {
    return target;
  }
}

/**
 * Reads every `<outRoot>/*\/report.json` for the given target, oldest first.
 * No new scanning code — `scan`/`rescan` already write timestamped report
 * directories; this just reads the series back, per NEXT_ACTIONS.md #14.
 */
export async function collectHistory(outRoot, target) {
  const hostname = hostnameFor(target);
  const entries = await readdir(outRoot, { withFileTypes: true }).catch(() => []);

  const reports = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const report = await loadReport(path.join(outRoot, entry.name, "report.json"));
      if (hostnameFor(report.target) === hostname) reports.push(report);
    } catch {
      // not a scan report directory (e.g. a compare/monitor/loop output) — skip
    }
  }

  reports.sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));
  return reports;
}

/**
 * Builds the score-over-time timeline plus a regression flag, reusing
 * `buildDiffReport`'s check-level fixed/regressed logic between each
 * consecutive pair of scans rather than comparing overall scores only.
 */
export function buildMonitorReport(target, history) {
  const scannerNames = [...new Set(history.flatMap((r) => Object.keys(r.scanners ?? {})))];

  const timeline = history.map((r) => ({
    generatedAt: r.generatedAt,
    scanners: Object.fromEntries(
      scannerNames.map((name) => {
        const s = r.scanners?.[name];
        if (!s) return [name, { present: false }];
        if (s.error) return [name, { present: true, error: s.error }];
        return [name, { present: true, score: s.score?.overall ?? null, grade: s.score?.grade ?? null }];
      })
    ),
  }));

  const regressions = [];
  for (let i = 1; i < history.length; i++) {
    const diff = buildDiffReport(history[i - 1], history[i]);
    for (const [scanner, s] of Object.entries(diff.scanners)) {
      if (s.comparable && s.regressed.length) {
        regressions.push({ generatedAt: history[i].generatedAt, scanner, regressed: s.regressed });
      }
    }
  }

  return { target, generatedAt: new Date().toISOString(), scans: history.length, timeline, regressions };
}

export function renderMonitorMarkdown(monitor) {
  const lines = [];
  lines.push(`# Score-Over-Time — ${monitor.target}`);
  lines.push("");
  lines.push(`${monitor.scans} scan(s) found.`);
  lines.push("");

  if (!monitor.timeline.length) {
    lines.push("No scans found for this target.");
    return lines.join("\n");
  }

  const scannerNames = [...new Set(monitor.timeline.flatMap((t) => Object.keys(t.scanners)))];
  lines.push(`| Scanned | ${scannerNames.join(" | ")} |`);
  lines.push(`|---|${scannerNames.map(() => "---").join("|")}|`);
  for (const t of monitor.timeline) {
    const cells = scannerNames.map((name) => {
      const v = t.scanners[name];
      if (!v?.present) return "—";
      if (v.error) return "FAILED";
      return `${v.score ?? "n/a"} (${v.grade ?? "n/a"})`;
    });
    lines.push(`| ${t.generatedAt} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  if (monitor.regressions.length) {
    lines.push(`## Regressions (${monitor.regressions.length})`);
    lines.push("");
    for (const r of monitor.regressions) {
      lines.push(`- **${r.generatedAt}** (${r.scanner}):`);
      for (const c of r.regressed) lines.push(`  - \`${c.id}\` (${c.category}): ${c.from} → ${c.to} — ${c.message}`);
    }
    lines.push("");
  } else {
    lines.push("No regressions detected between consecutive scans.");
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeMonitorReport(outDir, monitor) {
  await writeJsonAndMarkdown(outDir, "monitor-report", monitor, renderMonitorMarkdown);
}
