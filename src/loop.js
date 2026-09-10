import path from "node:path";
import { detectStack } from "./detect-stack.js";
import { enhance } from "./enhance.js";
import { scanTarget } from "./scan.js";
import { buildDiffReport } from "./diff-report.js";
import { buildSite, ensureInstalled, startLocalServer } from "./lib/local-server.js";
import { startTunnel } from "./lib/tunnel.js";

const HOSTED_SCANNERS = ["is-agentic", "ora"];

/**
 * Fully local scan -> enhance -> rescan -> diff-report loop, with no live
 * deployment and no manual steps. Only supports the one fixer/platform pair
 * `enhance` itself supports (astro-starlight + cloudflare-pages), since
 * that's also the only platform `lib/local-server.js` knows how to serve.
 *
 * afdocs fetches the scanned URL itself, so `localhost` works for it as-is.
 * is-agentic/ora are hosted — their crawler runs on Vercel's/Ora's own
 * infrastructure and can never reach `localhost`. Requesting either opens a
 * Cloudflare Quick Tunnel (`lib/tunnel.js`) to the local preview server
 * instead of rejecting the request outright, so `loop` can exercise every
 * scanner without a real deployment.
 */
export async function runLoop(
  repoPath,
  { scanners = ["afdocs"], sampling = "deterministic", siteType, distDir = "dist", port, onProgress } = {}
) {
  const resolved = path.resolve(repoPath);
  const stack = await detectStack(resolved);
  if (!stack.supported) {
    throw new Error(`loop needs the same local repo checkout enhance needs. ${stack.reason}`);
  }

  const needsTunnel = scanners.some((s) => HOSTED_SCANNERS.includes(s));

  await ensureInstalled(resolved, { onProgress });

  onProgress?.("--- Baseline scan (before enhance) ---");
  await buildSite(resolved, { onProgress });
  let target = await startScanTarget(resolved, { platform: stack.platform, distDir, port, needsTunnel, onProgress });
  let baseline;
  try {
    baseline = (await scanTarget(target.url, scanners, { sampling, siteType, onProgress })).report;
  } finally {
    await target.stop();
  }

  onProgress?.("--- Enhance ---");
  const enhanceResult = await enhance(resolved);

  onProgress?.("--- Re-scan (after enhance) ---");
  await buildSite(resolved, { onProgress });
  target = await startScanTarget(resolved, { platform: stack.platform, distDir, port, needsTunnel, onProgress });
  let rescan;
  try {
    rescan = (await scanTarget(target.url, scanners, { sampling, siteType, onProgress })).report;
  } finally {
    await target.stop();
  }

  const diff = buildDiffReport(baseline, rescan);

  return { stack, enhanceResult, baseline, rescan, diff };
}

/**
 * Starts the local preview server and, if a hosted scanner was requested,
 * layers a Cloudflare Quick Tunnel on top so it's reachable from outside
 * this machine. Returns a single `{ url, stop }` regardless — callers don't
 * need to know whether a tunnel is involved.
 */
async function startScanTarget(resolved, { platform, distDir, port, needsTunnel, onProgress }) {
  const server = await startLocalServer(resolved, { platform, distDir, port, onProgress });
  if (!needsTunnel) {
    return server;
  }

  try {
    const tunnel = await startTunnel(server.url, { onProgress });
    return {
      url: tunnel.url,
      async stop() {
        await tunnel.stop();
        await server.stop();
      },
    };
  } catch (err) {
    await server.stop();
    throw err;
  }
}
