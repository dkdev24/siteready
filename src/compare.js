import { writeJsonAndMarkdown } from "./lib/write-report.js";

/**
 * N-way side-by-side comparison over already-scanned sites. Reuses each
 * site's normalized report — no new scanning logic, per NEXT_ACTIONS.md #14.
 */
export function buildCompareReport(sites) {
  const scannerNames = [...new Set(sites.flatMap((s) => Object.keys(s.report.scanners ?? {})))];

  return {
    generatedAt: new Date().toISOString(),
    targets: sites.map((s) => s.target),
    scanners: Object.fromEntries(
      scannerNames.map((name) => [
        name,
        Object.fromEntries(
          sites.map((s) => {
            const scanner = s.report.scanners?.[name];
            if (!scanner) return [s.target, { present: false }];
            if (scanner.error) return [s.target, { present: true, error: scanner.error }];
            return [
              s.target,
              { present: true, score: scanner.score?.overall ?? null, grade: scanner.score?.grade ?? null },
            ];
          })
        ),
      ])
    ),
  };
}

export function renderCompareMarkdown(compare) {
  const lines = [];
  lines.push("# Agent Readiness Comparison");
  lines.push("");
  lines.push(`Generated: ${compare.generatedAt}`);
  lines.push("");

  for (const [name, byTarget] of Object.entries(compare.scanners)) {
    lines.push(`## Scanner: ${name}`);
    lines.push("");
    lines.push("| Target | Score | Grade |");
    lines.push("|---|---|---|");
    for (const target of compare.targets) {
      const v = byTarget[target];
      if (!v?.present) lines.push(`| ${target} | — | not scanned |`);
      else if (v.error) lines.push(`| ${target} | — | FAILED: ${v.error} |`);
      else lines.push(`| ${target} | ${v.score ?? "n/a"} | ${v.grade ?? "n/a"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeCompareReport(outDir, compare) {
  await writeJsonAndMarkdown(outDir, "compare-report", compare, renderCompareMarkdown);
}
