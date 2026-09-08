import { runAfdocsScan } from "./scanners/afdocs.js";
import { runIsAgenticScan } from "./scanners/is-agentic.js";
import { runOraScan } from "./scanners/ora.js";
import { buildReport } from "./report.js";

export const SUPPORTED_SCANNERS = ["is-agentic", "afdocs", "ora"];

/**
 * Runs the given scanners against a target and returns a normalized report,
 * plus each scanner's raw output keyed by name. Shared by the `scan` and
 * `rescan` CLI paths (and by `loop`, v0.4) so re-scanning a target after
 * `enhance` uses exactly the same logic as the original baseline scan.
 */
export async function scanTarget(target, scannerNames, { sampling = "deterministic", onProgress } = {}) {
  const unsupported = scannerNames.filter((s) => !SUPPORTED_SCANNERS.includes(s));
  if (unsupported.length) {
    throw new Error(
      `Unsupported scanner(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_SCANNERS.join(", ")}`
    );
  }

  const scannerResults = [];
  const rawByScanner = {};

  for (const scannerName of scannerNames) {
    onProgress?.(`Running ${scannerName} (this can take a minute)...`);
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
  }

  const report = buildReport(target, scannerResults);
  return { report, rawByScanner };
}
