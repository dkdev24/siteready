import { runNpxCli } from "../lib/npx-runner.js";

// Pinned, not a bare "afdocs" packageSpec — an unpinned npx call always
// fetches whatever's newest, and this CLI is young enough that a breaking
// JSON-schema change upstream could silently break every scan. Bump
// deliberately, re-verify normalize() against the new output, don't let npx
// auto-float this. `npm run check-scanner-versions` reports when this pin
// falls behind npm's latest published version.
export const PACKAGE_NAME = "afdocs";
export const PINNED_VERSION = "0.20.0";
// One-off override for trying a newer release without editing source — the
// default stays pinned for everyone else. Re-verify normalize() before
// promoting an override to the new PINNED_VERSION.
const PACKAGE_SPEC = `${PACKAGE_NAME}@${process.env.AFDOCS_VERSION ?? PINNED_VERSION}`;

/**
 * Runs the afdocs CLI (https://agentdocsspec.com/) against a URL and returns
 * both the normalized result and the raw JSON afdocs produced.
 */
export async function runAfdocsScan(url, { sampling = "deterministic" } = {}) {
  const parsed = new URL(url); // throws on malformed input
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Refusing to scan non-http(s) URL: ${url}`);
  }

  const stdout = await runNpxCli(PACKAGE_SPEC, [
    "check",
    parsed.toString(),
    "--format",
    "json",
    "--score",
    "--fixes",
    "--sampling",
    sampling,
  ]);

  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch (parseError) {
    throw new Error(`afdocs produced non-JSON output: ${parseError.message}`);
  }

  return { normalized: normalize(raw), raw };
}

function normalize(raw) {
  const checks = raw.results.map((r) => {
    const scoreInfo = raw.scoring?.checkScores?.[r.id];
    return {
      id: r.id,
      category: r.category,
      status: r.status, // pass | warn | fail | skip | error
      message: r.message,
      fix: raw.scoring?.resolutions?.[r.id] ?? null,
      earnedScore: scoreInfo?.earnedScore ?? null,
      maxScore: scoreInfo?.maxScore ?? null,
    };
  });

  return {
    scanner: "afdocs",
    specUrl: raw.specUrl ?? "https://agentdocsspec.com/spec/",
    target: raw.url,
    scannedAt: raw.timestamp,
    samplingStrategy: raw.samplingStrategy,
    testedPages: raw.testedPages,
    score: raw.scoring
      ? { overall: raw.scoring.overall, grade: raw.scoring.grade }
      : null,
    categoryScores: raw.scoring?.categoryScores ?? {},
    summary: raw.summary,
    checks,
  };
}
