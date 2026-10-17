import { runAfdocsScan } from "./scanners/afdocs.js";
import { runIsAgenticScan } from "./scanners/is-agentic.js";
import { runOraScan } from "./scanners/ora.js";
import { runAgentHeadersScan } from "./scanners/agent-headers.js";
import { buildReport } from "./report.js";
import { SITE_TYPES } from "./site-types.js";

export const SUPPORTED_SCANNERS = ["is-agentic", "afdocs", "ora", "agent-headers"];

// ora and is-agentic hit the same underlying Ora API — is-agentic's score is
// a strict subset (`include=essentials`) of ora's full 127-check ranker.
// Running both by default doubles the hosted-API cost for overlapping data
// with no fixer yet acting on ora's extra checks, so ora stays opt-in
// (`--scanners ora`) until that changes. agent-headers is in-house plain
// fetches (no API cost), so it runs by default.
// Scanners that run on a hosted service and so need a publicly reachable URL
// (for a local site, a Cloudflare Quick Tunnel). Every other scanner fetches the
// site itself and should hit the local server directly: the tunnel's Cloudflare
// edge answers AI-crawler user agents (what agent-headers sends) with 403.
export const HOSTED_SCANNERS = ["is-agentic", "ora"];

/** The URL a scanner should use: hosted ones get `target`, the rest `localTarget` when there is one. */
export function targetFor(scannerName, target, localTarget) {
  return !HOSTED_SCANNERS.includes(scannerName) && localTarget ? localTarget : target;
}

export const DEFAULT_SCANNERS = ["is-agentic", "afdocs", "agent-headers"];

/**
 * Runs the given scanners against a target and returns a normalized report,
 * plus each scanner's raw output keyed by name. Shared by the `scan` and
 * `rescan` CLI paths (and by `scan-local`/`rescan-local`) so re-scanning a
 * target after `enhance` uses exactly the same logic as the original
 * baseline scan.
 */
export async function scanTarget(target, scannerNames, { sampling = "deterministic", siteType, localTarget, onProgress } = {}) {
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
      const url = targetFor(scannerName, target, localTarget);
      if (scannerName === "is-agentic") {
        result = await runIsAgenticScan(url);
      } else if (scannerName === "afdocs") {
        result = await runAfdocsScan(url, { sampling });
      } else if (scannerName === "ora") {
        result = await runOraScan(url);
      } else if (scannerName === "agent-headers") {
        result = await runAgentHeadersScan(url);
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
