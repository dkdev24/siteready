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

// 2026-09-12 experiment (WORKLOG.md "round three"): 6 tunnels created 4min
// apart, single delayed probe each, succeeded 6/6; a same-day retest with
// only a 10s gap between attempts still failed 3/3. So a short in-process
// cooldown between retries doesn't help. IMPORTANT: those are the only two
// data points we have -- "10s: fails" and "4min: works" -- nothing between
// them is tested, and Cloudflare documents no SLA at all for Quick Tunnel
// DNS propagation (these are explicitly best-effort, account-less tunnels).
// MIN_GAP_MS is picked from that gap, not proven sufficient: it's a
// known-bad-zone filter (below it, we have direct evidence of failure), not
// a guarantee of success above it. `waitForReachable` still does the real,
// empirical check every time regardless of this guard -- if MIN_GAP_MS turns
// out to be too short in some fraction of cases, the caller still gets an
// honest failure (tagged `reachabilityFlap`, see below), never a false
// "it worked." Track the last tunnel creation across processes (e.g. a
// scan-local run followed shortly by a rescan-local, each its own
// `startTunnel` call) and refuse to open a new one before this much time has
// passed, with a clear error telling the caller how long to wait instead.
const MIN_GAP_MS = 2 * 60_000;

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

async function msSinceLastTunnelCreated() {
  const { createdAt } = await readState();
  if (!createdAt.length) return null;
  return Date.now() - Math.max(...createdAt);
}

// Returns how many tunnels this machine has created in the trailing
// RATE_LIMIT_WINDOW_MS, for the proximity warning above -- not used by the
// MIN_GAP_MS check, which only cares about the single most recent one.
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
 * Refuses to even try if a tunnel (this call or a separate `siteready`
 * invocation, e.g. a `rescan-local` run shortly after `scan-local`) was
 * created within the last MIN_GAP_MS — see that constant's comment.
 */
export async function startTunnel(localUrl, { onProgress, attempts = configuredAttempts() } = {}) {
  const sinceLastMs = await msSinceLastTunnelCreated();
  if (sinceLastMs !== null && sinceLastMs < MIN_GAP_MS) {
    const waitMoreS = Math.ceil((MIN_GAP_MS - sinceLastMs) / 1000);
    throw new Error(
      `Refusing to open a new Quick Tunnel: the last one (this run or a previous \`siteready\` ` +
        `command) was created ${Math.round(sinceLastMs / 1000)}s ago, under the ${MIN_GAP_MS / 60_000}min ` +
        "minimum gap. Cloudflare's DNS propagation for a fresh *.trycloudflare.com hostname is " +
        "unreliable when tunnels are created this close together (see WORKLOG.md 2026-09-12 \"round " +
        `three\"). Wait ~${waitMoreS}s and retry, so a real gap (e.g. reviewing the report) falls ` +
        "between the two tunnels."
    );
  }
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
      // A reachability-flap failure isn't fixed by an immediate fresh
      // tunnel — round three's own retry-with-10s-cooldown test still
      // failed 3/3. Retrying it back-to-back would just repeat the same
      // doomed pattern (and reset MIN_GAP_MS's clock for no benefit), so
      // stop here instead of burning the remaining attempts.
      if (err.reachabilityFlap) {
        throw new Error(
          `Tunnel to ${localUrl} hit the known DNS-propagation-flap failure mode on attempt ${attempt} ` +
            `(${err.message}). Retrying immediately doesn't help this one (see WORKLOG.md 2026-09-12 ` +
            `"round three") -- wait at least ${MIN_GAP_MS / 60_000}min and re-run.`
        );
      }
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
  const err = new Error(
    `Tunnel at ${url} did not become reachable within ${timeoutMs}ms (${lastErr?.message ?? "no response"})`
  );
  // Tags this as the specific DNS-propagation-flap failure mode (WORKLOG.md
  // 2026-09-12 "round three") so the retry loop above can tell it apart from
  // a spawn/exit error — evidence says an immediate fresh-tunnel retry does
  // NOT recover from this one, unlike the other failure modes.
  err.reachabilityFlap = true;
  throw err;
}
