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

// Quick Tunnels are anonymous and best-effort ("these account-less Tunnels
// have no uptime guarantee" — cloudflared's own banner). Observed failure
// mode: the hostname cloudflared prints never resolves at all (ENOTFOUND on
// `*.trycloudflare.com`, reproducible via curl and Node's fetch), 3 times in
// 4 attempts. That's a property of the *hostname handed out*, not of the
// local server or of cloudflared's config — retrying the same URL never
// recovers, but a fresh tunnel gets a fresh random hostname, which does.
// So the retry unit is a whole tunnel: kill the connector, spawn a new one.
const DEFAULT_ATTEMPTS = 3;

function configuredAttempts() {
  const raw = process.env.SITEREADY_TUNNEL_ATTEMPTS;
  if (!raw) return DEFAULT_ATTEMPTS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `SITEREADY_TUNNEL_ATTEMPTS must be a positive integer, got ${JSON.stringify(raw)}.`
    );
  }
  return parsed;
}

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
 *
 * Unreliable by nature (see DEFAULT_ATTEMPTS above), so a failed attempt is
 * torn down completely and retried as a brand-new tunnel rather than
 * re-probed. Override the attempt count with `SITEREADY_TUNNEL_ATTEMPTS`.
 */
export async function startTunnel(localUrl, { onProgress, attempts = configuredAttempts() } = {}) {
  const failures = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const suffix = attempts > 1 ? ` (attempt ${attempt}/${attempts})` : "";
    onProgress?.(
      `Opening a Cloudflare Quick Tunnel to ${localUrl} (for hosted scanners)${suffix}...`
    );
    try {
      return await startTunnelOnce(localUrl, { onProgress });
    } catch (err) {
      failures.push(`attempt ${attempt}: ${err.message}`);
      if (attempt < attempts) {
        onProgress?.(`Tunnel attempt ${attempt} failed (${err.message}); retrying with a fresh tunnel.`);
      }
    }
  }

  throw new Error(
    `Could not open a usable Cloudflare Quick Tunnel to ${localUrl} after ${attempts} ` +
      `attempt${attempts === 1 ? "" : "s"}. Quick Tunnels are anonymous and best-effort; ` +
      "re-run, raise SITEREADY_TUNNEL_ATTEMPTS, or scan a deployed URL directly instead of " +
      `using loop with a hosted scanner.\n  ${failures.join("\n  ")}`
  );
}

async function startTunnelOnce(localUrl, { onProgress }) {
  const child = spawnNpxCli(PACKAGE_SPEC, ["tunnel", "--url", localUrl]);

  let buffered = "";
  child.stdout?.on("data", (chunk) => (buffered += chunk.toString()));
  child.stderr?.on("data", (chunk) => (buffered += chunk.toString()));

  let exited = false;
  let exitError = null;
  // Without a listener a spawn failure is an unhandled 'error' event, which
  // would take the whole process down instead of just failing this attempt.
  child.on("error", (err) => {
    exited = true;
    exitError = err;
  });
  child.on("exit", (code, signal) => {
    exited = true;
    if (code && code !== 0) exitError = new Error(`cloudflared tunnel exited with code ${code} (signal ${signal})`);
  });

  let url;
  try {
    url = await waitForTunnelUrl(() => buffered, () => exitError);
    await waitForReachable(url, { getExitError: () => exitError });
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
async function waitForReachable(
  url,
  { timeoutMs = READY_TIMEOUT_MS, intervalMs = 500, getExitError = () => null } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastErr = err;
    }
    // The connector dying mid-probe means this tunnel is never coming up —
    // fail now so the caller can spend the remaining time on a fresh one.
    const exitError = getExitError();
    if (exitError) throw exitError;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Tunnel at ${url} did not become reachable within ${timeoutMs}ms (${lastErr?.message ?? "no response"})`
  );
}
