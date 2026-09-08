import { runNpxCli } from "../lib/npx-runner.js";

// Pinned for the same reason afdocs.js pins its packageSpec — see that
// file's comment.
const PACKAGE_SPEC = "is-agentic@1.0.1";

/**
 * Runs the Vercel Is Agentic CLI (https://is-agentic.com/) against a URL and
 * returns both the normalized result and the raw JSON it produced.
 */
export async function runIsAgenticScan(url) {
  const parsed = new URL(url); // throws on malformed input
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Refusing to scan non-http(s) URL: ${url}`);
  }

  const stdout = await runNpxCli(PACKAGE_SPEC, [parsed.toString(), "--json"]);

  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch (parseError) {
    throw new Error(`is-agentic produced non-JSON output: ${parseError.message}`);
  }

  return { normalized: normalize(raw), raw };
}

// is-agentic only lists non-passing checks in `issues[]` (result: "failed" |
// "partial") — passing checks are counted in score_breakdown but never named
// individually, unlike afdocs which reports every check it ran.
function normalize(raw) {
  const essential = raw.score_breakdown?.essential ?? { earned: 0, available: 0, passing: 0, total: 0 };
  const recommended = raw.score_breakdown?.recommended ?? { earned: 0, available: 0, passing: 0, total: 0 };
  const bonus = raw.score_breakdown?.bonus ?? null;

  const checks = (raw.issues ?? []).map((issue) => ({
    id: issue.id,
    category: issue.tier,
    status: issue.result === "failed" ? "fail" : "warn",
    message: issue.details,
    fix: issue.recommendation ?? null,
    earnedScore: null,
    maxScore: null,
  }));

  const total = essential.total + recommended.total;
  const pass = essential.passing + recommended.passing;
  const fail = checks.filter((c) => c.status === "fail").length;
  const warn = checks.filter((c) => c.status === "warn").length;

  const categoryScores = {
    essential: { score: `${essential.earned}/${essential.available}`, grade: gradeFromRatio(essential.earned, essential.available) },
    recommended: { score: `${recommended.earned}/${recommended.available}`, grade: gradeFromRatio(recommended.earned, recommended.available) },
  };
  if (bonus) {
    categoryScores.bonus = { score: `+${bonus.points} (${bonus.positive_signals} signals)`, grade: "—" };
  }

  return {
    scanner: "is-agentic",
    reportUrl: raw.report_url ?? null,
    target: raw.target,
    scannedAt: raw.scanned_at,
    score: { overall: raw.score, grade: gradeFromScore(raw.score) },
    categoryScores,
    summary: { total, pass, warn, fail, skip: 0, error: 0 },
    checks,
  };
}

function gradeFromRatio(earned, available) {
  if (!available) return "—";
  return gradeFromScore((earned / available) * 100);
}

function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
