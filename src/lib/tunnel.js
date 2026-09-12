import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { killProcessTree, spawnNpxCli } from "./npx-runner.js";

// Pinned for the same reason scanner CLIs are pinned (see afdocs.js) — an
// unpinned npx call always fetches whatever's newest.
const PACKAGE_SPEC = "cloudflared@0.7.3";

// The generated *.trycloudflare.com URL is printed in a box-drawing banner
// among cloudflared's own log lines — match just the URL itself so this
// doesn't depend on the surrounding log format, which isn't a documented
// contract.
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

// cloudflared's own "precheck complete hard_fail=false" line (end of its
// CONNECTIVITY PRE-CHECKS block) confirms *this* connector's control-plane
// link to Cloudflare's edge is healthy. An earlier investigation (WORKLOG.md
// 2026-09-12 "round two") wrote this off as unrelated to public-hostname
// reachability, based on runs that were already polling the public URL
// before this line appeared. Retested 2026-09-12 with probing withheld
// until this line is seen: reachable on the first try every time, no
// retries needed -- vs. the old immediate-polling loop, which failed 3/3.
const PRECHECK_RE = /precheck complete.*hard_fail=false/;

const READY_TIMEOUT_MS = 30_000;

// 2026-09-12: measured directly (polling 1.1.1.1 every second right after
// cloudflared's own "Registered tunnel connection" log line) that a fresh
// *.trycloudflare.com hostname can take *up to ~20s* to resolve at all, then
// works instantly once it does -- this is per-hostname propagation variance,
// not a connectivity failure. `READY_TIMEOUT_MS` (30s) leaves too little
// margin for that, which is what earlier sessions misread as "Cloudflare's
// DNS is flaky" and tried to fix with inter-tunnel spacing (a min-gap guard,
// removed below). Spacing was never the right lever: each tunnel gets an
// independent random hostname with no shared DNS state, so waiting longer
// between tunnel *creations* can't shorten any single hostname's own
// propagation delay -- confirmed when 5 tunnels created under 30s apart all
// resolved fine, while separately-spaced single-probe tests kept failing
// purely because their probe timeout was too short. Give `waitForReachable`
// real margin instead of gatekeeping tunnel creation.
const REACHABILITY_TIMEOUT_MS = 60_000;

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
// have no uptime guarantee" — cloudflared's own banner). A fresh tunnel gets
// a fresh random hostname with its own independent propagation-delay draw,
// so the retry unit is a whole tunnel: kill the connector, spawn a new one,
// no special-casing needed for a slow-to-resolve hostname now that
// `waitForReachable` waits out realistic propagation delay on its own.
const DEFAULT_ATTEMPTS = 3;

// Separately, Quick Tunnel *creation* itself is rate-limited (HTTP 429,
// Cloudflare error 1015) -- observed at ~20 tunnels/hour from one source IP
// (WORKLOG.md 2026-09-12 "round two"), also undocumented by Cloudflare and
// not necessarily exact. Warn (don't block -- we're not sure of the real
// number) once usage in the trailing hour gets close, so a 429 shows up as
// an expected warning instead of a surprise.
const RATE_LIMIT_WARN_THRESHOLD = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 60_000;

const STATE_FILE = path.join(os.tmpdir(), "siteready-tunnel-state.json");

async function readState() {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
    return { createdAt: Array.isArray(state.createdAt) ? state.createdAt : [] };
  } catch {
    return { createdAt: [] }; // no prior record, or unreadable -- don't block on it
  }
}

// Returns how many tunnels this machine has created in the trailing
// RATE_LIMIT_WINDOW_MS, for the proximity warning above.
async function recentTunnelCountForWarning() {
  const { createdAt } = await readState();
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  return createdAt.filter((t) => t > cutoff).length;
}

async function recordTunnelCreated() {
  try {
    const { createdAt } = await readState();
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    const pruned = createdAt.filter((t) => t > cutoff);
    pruned.push(Date.now());
    await writeFile(STATE_FILE, JSON.stringify({ createdAt: pruned }));
  } catch {
    // best-effort tracking only
  }
}

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
 * what. This is the narrowest fix: it makes a local `scan-local`/
 * `rescan-local` preview server briefly internet-routable without deploying
 * anywhere, so those commands can exercise every scanner, not just afdocs.
 * The site is reachable by anyone with the (random, short-lived) tunnel URL
 * for the scan's duration — same risk class as a Cloudflare Pages preview
 * deployment, shorter-lived and no account needed.
 *
 * Unreliable by nature (see DEFAULT_ATTEMPTS above), so a failed attempt is
 * torn down completely and retried as a brand-new tunnel rather than
 * re-probed. Override the attempt count with `SITEREADY_TUNNEL_ATTEMPTS`.
 */
export async function startTunnel(localUrl, { onProgress, attempts = configuredAttempts() } = {}) {
  await recordTunnelCreated();

  const recentCount = await recentTunnelCountForWarning();
  if (recentCount >= RATE_LIMIT_WARN_THRESHOLD) {
    onProgress?.(
      `Warning: ${recentCount} Quick Tunnels created in the last hour from this machine, ` +
        `approaching the ~20/hour creation limit Cloudflare has been observed to enforce (undocumented, ` +
        "not exact -- see WORKLOG.md 2026-09-12 \"round two\"). A 429 here means that limit, not a bug."
    );
  }

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
      `scan-local/rescan-local with a hosted scanner.\n  ${failures.join("\n  ")}`
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
    await waitForPrecheck(() => buffered, () => exitError);
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

// Waits for cloudflared's own precheck line before the first reachability
// probe (see PRECHECK_RE above). Times out silently rather than throwing --
// a cloudflared version that changes this log line shouldn't break tunnels
// outright, just lose this head start and fall back to waitForReachable's
// own polling from here.
async function waitForPrecheck(getBuffer, getExitError, { timeoutMs = READY_TIMEOUT_MS, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (PRECHECK_RE.test(getBuffer())) return;
    if (getExitError()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Confirms the tunnel is answering from *our* vantage point before handing
// the URL to a scanner — a real response (any status under 500; Cloudflare's
// own edge-error pages for a not-yet-registered route come back 5xx) means
// the connector is live, not just that cloudflared printed a URL.
async function waitForReachable(
  url,
  { timeoutMs = REACHABILITY_TIMEOUT_MS, intervalMs = 500, getExitError = () => null } = {}
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
