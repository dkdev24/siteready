import path from "node:path";
import { detectStack } from "./detect-stack.js";
import { enhance } from "./enhance.js";
import { scanTarget } from "./scan.js";
import { buildDiffReport } from "./diff-report.js";
import { buildSite, ensureInstalled, startLocalServer } from "./lib/local-server.js";

/**
 * Fully local scan -> enhance -> rescan -> diff-report loop, with no live
 * deployment and no manual steps. Only supports the one fixer/platform pair
 * `enhance` itself supports (astro-starlight + cloudflare-pages), since
 * that's also the only platform `lib/local-server.js` knows how to serve.
 */
export async function runLoop(
  repoPath,
  { scanners = ["afdocs"], sampling = "deterministic", distDir = "dist", port, onProgress } = {}
) {
  const resolved = path.resolve(repoPath);
  const stack = await detectStack(resolved);
  if (!stack.supported) {
    throw new Error(`loop needs the same local repo checkout enhance needs. ${stack.reason}`);
  }
  if (scanners.includes("is-agentic")) {
    throw new Error(
      "loop scans a local preview server (no live deployment) — is-agentic's CLI submits to a hosted " +
        "scan service that can't reach localhost. Use --scanners afdocs for loop, or scan/rescan a real " +
        "deployed URL with is-agentic separately."
    );
  }

  await ensureInstalled(resolved, { onProgress });

  onProgress?.("--- Baseline scan (before enhance) ---");
  await buildSite(resolved, { onProgress });
  let server = await startLocalServer(resolved, { platform: stack.platform, distDir, port, onProgress });
  let baseline;
  try {
    baseline = (await scanTarget(server.url, scanners, { sampling, onProgress })).report;
  } finally {
    await server.stop();
  }

  onProgress?.("--- Enhance ---");
  const enhanceResult = await enhance(resolved);

  onProgress?.("--- Re-scan (after enhance) ---");
  await buildSite(resolved, { onProgress });
  server = await startLocalServer(resolved, { platform: stack.platform, distDir, port, onProgress });
  let rescan;
  try {
    rescan = (await scanTarget(server.url, scanners, { sampling, onProgress })).report;
  } finally {
    await server.stop();
  }

  const diff = buildDiffReport(baseline, rescan);

  return { stack, enhanceResult, baseline, rescan, diff };
}
