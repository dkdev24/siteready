import { killProcessTree, spawnNpxCli } from "./npx-runner.js";

// Pinned for the same reason scanner CLIs are pinned (see afdocs.js) — an
// unpinned npx call always fetches whatever's newest.
const PACKAGE_SPEC = "cloudflared@0.7.3";

// The generated *.trycloudflare.com URL is printed in a box-drawing banner
// among cloudflared's own log lines — match just the URL itself so this
// doesn't depend on the surrounding log format, which isn't a documented
// contract.
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const READY_TIMEOUT_MS = 30_000;
// cloudflared prints the URL as soon as *this* connector registers with
// Cloudflare's edge, but a hosted scanner's crawler hits the edge from a
// different network path/PoP that can take a few extra seconds to converge
// (cloudflared's own banner: "it may take some time to be reachable"). Seen
// in practice: a scan attempted right after the URL was printed got
// "Domain is not reachable" from Ora even though a local curl against the
// same URL succeeded within ~1s. ponytail: fixed buffer, not a real global-
// propagation check (would need probing from Ora's own vantage point,
// which we can't do) — bump PROPAGATION_BUFFER_MS if this still races.
const PROPAGATION_BUFFER_MS = 8_000;

/**
 * Opens a Cloudflare Quick Tunnel (`cloudflared tunnel --url <localUrl>`)
 * and resolves with the ephemeral public HTTPS URL it prints. No Cloudflare
 * account/signup needed — the URL is random and torn down when `stop()` is
 * called.
 *
 * Exists because hosted scanners (is-agentic, ora) run their own crawler on
 * Vercel's/Ora's infrastructure, not this machine — unlike afdocs, which
 * fetches the URL itself, `localhost` is never reachable for them no matter
 * what. This is the narrowest fix: it makes a local `loop` preview server
 * briefly internet-routable without deploying anywhere, so `loop` can
 * exercise every scanner, not just afdocs. The site is reachable by anyone
 * with the (random, short-lived) tunnel URL for the scan's duration — same
 * risk class as a Cloudflare Pages preview deployment, shorter-lived and no
 * account needed.
 */
export async function startTunnel(localUrl, { onProgress } = {}) {
  onProgress?.(`Opening a Cloudflare Quick Tunnel to ${localUrl} (for hosted scanners)...`);
  const child = spawnNpxCli(PACKAGE_SPEC, ["tunnel", "--url", localUrl]);

  let buffered = "";
  child.stdout?.on("data", (chunk) => (buffered += chunk.toString()));
  child.stderr?.on("data", (chunk) => (buffered += chunk.toString()));

  let exited = false;
  let exitError = null;
  child.on("exit", (code, signal) => {
    exited = true;
    if (code && code !== 0) exitError = new Error(`cloudflared tunnel exited with code ${code} (signal ${signal})`);
  });

  let url;
  try {
    url = await waitForTunnelUrl(() => buffered, () => exitError);
    await waitForReachable(url);
    await new Promise((r) => setTimeout(r, PROPAGATION_BUFFER_MS));
  } catch (err) {
    await killProcessTree(child);
    throw err;
  }

  onProgress?.(`Tunnel ready: ${url}`);

  return {
    url,
    async stop() {
      if (!exited) await killProcessTree(child);
    },
  };
}

async function waitForTunnelUrl(getBuffer, getExitError, { timeoutMs = READY_TIMEOUT_MS, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = getBuffer().match(TUNNEL_URL_RE);
    if (match) return match[0];
    const exitError = getExitError();
    if (exitError) throw exitError;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`cloudflared did not print a tunnel URL within ${timeoutMs}ms.`);
}

// Confirms the tunnel is answering from *our* vantage point before handing
// the URL to a scanner — a real response (any status under 500; Cloudflare's
// own edge-error pages for a not-yet-registered route come back 5xx) means
// the connector is live, not just that cloudflared printed a URL.
async function waitForReachable(url, { timeoutMs = READY_TIMEOUT_MS, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Tunnel at ${url} did not become reachable within ${timeoutMs}ms (${lastErr?.message ?? "no response"})`
  );
}
