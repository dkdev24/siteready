import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STATUS_ORDER = { fail: 0, error: 1, warn: 2, skip: 3, pass: 4 };

/**
 * Builds the unified scorecard from one or more normalized scanner results.
 * v0.2 runs is-agentic + afdocs side by side under this same shape. A
 * scanner that threw (network blip, rate limit) is recorded as
 * `{ scanner, error }` instead of being silently dropped, so a partial scan
 * still produces a report for the scanners that succeeded — see #15.
 */
export function buildReport(target, scannerResults, errors = []) {
  const scanners = Object.fromEntries(
    scannerResults.map((r) => [r.normalized.scanner, r.normalized])
  );
  for (const { scanner, error } of errors) {
    scanners[scanner] = { scanner, error };
  }
  return {
    target,
    generatedAt: new Date().toISOString(),
    partial: errors.length > 0,
    scanners,
  };
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Agent Readiness Report — ${report.target}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");

  for (const [scannerName, s] of Object.entries(report.scanners)) {
    lines.push(`## Scanner: ${scannerName}`);
    lines.push("");
    if (s.error) {
      lines.push(`**FAILED** — ${s.error}`);
      lines.push("");
      continue;
    }
    if (s.score) {
      lines.push(`**Overall score: ${s.score.overall} / 100 (${s.score.grade})**`);
      lines.push("");
    }
    lines.push(
      `Checks tested: ${s.summary.total} — ` +
        `${s.summary.pass} pass, ${s.summary.warn} warn, ${s.summary.fail} fail, ` +
        `${s.summary.skip} skip, ${s.summary.error} error` +
        (s.testedPages ? ` (sampled ${s.testedPages} pages, ${s.samplingStrategy})` : "")
    );
    lines.push("");

    if (Object.keys(s.categoryScores).length) {
      lines.push("| Category | Score | Grade |");
      lines.push("|---|---|---|");
      for (const [cat, v] of Object.entries(s.categoryScores)) {
        lines.push(`| ${cat} | ${v.score} | ${v.grade} |`);
      }
      lines.push("");
    }

    const notPassing = s.checks
      .filter((c) => c.status !== "pass")
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

    if (notPassing.length) {
      lines.push("### Failing / warning checks");
      lines.push("");
      for (const c of notPassing) {
        lines.push(`- **[${c.status.toUpperCase()}]** \`${c.id}\` (${c.category}) — ${c.message}`);
        if (c.fix) lines.push(`  - Fix: ${c.fix}`);
      }
      lines.push("");
    } else {
      lines.push("All checks passing.");
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function writeReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await writeFile(path.join(outDir, "report.md"), renderMarkdown(report), "utf8");
}

export async function writeRaw(outDir, scannerName, raw) {
  const rawDir = path.join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });
  await writeFile(
    path.join(rawDir, `${scannerName}.json`),
    JSON.stringify(raw, null, 2),
    "utf8"
  );
}
