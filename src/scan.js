import { runAfdocsScan } from "./scanners/afdocs.js";
import { runIsAgenticScan } from "./scanners/is-agentic.js";
import { runOraScan } from "./scanners/ora.js";
import { buildReport } from "./report.js";
import { SITE_TYPES } from "./site-types.js";

export const SUPPORTED_SCANNERS = ["is-agentic", "afdocs", "ora"];

// ora and is-agentic hit the same underlying Ora API — is-agentic's score is
// a strict subset (`include=essentials`) of ora's full 127-check ranker.
// Running both by default doubles the hosted-API cost for overlapping data
// with no fixer yet acting on ora's extra checks, so ora stays opt-in
// (`--scanners ora`) until that changes.
export const DEFAULT_SCANNERS = ["is-agentic", "afdocs"];

/**
 * Runs the given scanners against a target and returns a normalized report,
 * plus each scanner's raw output keyed by name. Shared by the `scan` and
 * `rescan` CLI paths (and by `loop`, v0.4) so re-scanning a target after
 * `enhance` uses exactly the same logic as the original baseline scan.
 */
export async function scanTarget(target, scannerNames, { sampling = "deterministic", siteType, onProgress } = {}) {
  const unsupported = scannerNames.filter((s) => !SUPPORTED_SCANNERS.includes(s));
  if (unsupported.length) {
    throw new Error(
      `Unsupported scanner(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_SCANNERS.join(", ")}`
    );
  }
  if (siteType && siteType !== "auto" && !SITE_TYPES.includes(siteType)) {
    throw new Error(`Unknown site type: ${siteType}. Supported: ${SITE_TYPES.join(", ")}, auto`);
  }

  const scannerResults = [];
  const rawByScanner = {};
  const errors = [];

  for (const scannerName of scannerNames) {
    onProgress?.(`Running ${scannerName} (this can take a minute)...`);
    try {
      let result;
      if (scannerName === "is-agentic") {
        result = await runIsAgenticScan(target);
      } else if (scannerName === "afdocs") {
        result = await runAfdocsScan(target, { sampling });
      } else if (scannerName === "ora") {
        result = await runOraScan(target);
      }
      scannerResults.push(result);
      rawByScanner[scannerName] = result.raw;
      onProgress?.(
        `${scannerName}: ${result.normalized.score?.overall ?? "n/a"}/100 (${result.normalized.score?.grade ?? "n/a"})`
      );
    } catch (err) {
      errors.push({ scanner: scannerName, error: err.message });
      onProgress?.(`${scannerName}: FAILED — ${err.message}`);
    }
  }

  const report = buildReport(target, scannerResults, errors, { siteType });
  return { report, rawByScanner, errors };
}
