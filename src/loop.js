import path from "node:path";
import { detectStack } from "./detect-stack.js";
import { scanTarget } from "./scan.js";
import { buildSite, ensureInstalled, startLocalServer } from "./lib/local-server.js";
import { startTunnel } from "./lib/tunnel.js";

const HOSTED_SCANNERS = ["is-agentic", "ora"];

/**
 * Single local scan, no enhance/rescan/diff — for a repo that hasn't been
 * deployed anywhere yet. Only needs `startLocalServer`'s platform support
 * (cloudflare-pages/vercel), not a fixer, so it checks `stack.platform`
 * directly rather than `stack.supported` (which is enhance-fixer-specific
 * and would wrongly reject e.g. plain Astro without Starlight).
 */
export async function runScanLocal(
  repoPath,
  { scanners = ["afdocs"], sampling = "deterministic", siteType, distDir = "dist", port, onProgress } = {}
) {
  const resolved = path.resolve(repoPath);
  const stack = await detectStack(resolved);
  // Jekyll's build isn't an npm project (bundler, not `npm run build`) --
  // `ensureInstalled`/`buildSite` below assume one, so it's excluded here
  // regardless of platform (github-pages or gitlab-pages). Every other
  // platform detectStack can return rides local-server.js's bespoke runner
  // (cloudflare-pages, vercel) or its generic static-file fallback -- no
  // per-platform allowlist to keep updating here as more get added.
  if (stack.framework === "jekyll") {
    throw new Error(
      `scan-local doesn't support Jekyll yet -- its build isn't an npm project. Detected platform=${stack.platform ?? "unknown"}.`
    );
  }
  if (!stack.platform) {
    throw new Error(`scan-local needs a local server siteready can run, but no platform was detected for ${resolved}.`);
  }

  const needsTunnel = scanners.some((s) => HOSTED_SCANNERS.includes(s));

  await ensureInstalled(resolved, { onProgress });
  await buildSite(resolved, { onProgress });

  const target = await startScanTarget(resolved, { platform: stack.platform, distDir, port, needsTunnel, onProgress });
  try {
    const { report, rawByScanner } = await scanTarget(target.url, scanners, { sampling, siteType, onProgress });
    return { stack, report, rawByScanner };
  } finally {
    await target.stop();
  }
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
