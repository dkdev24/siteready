// Ora (https://ora.ai/) is the engine behind Vercel's is-agentic.com —
// is-agentic calls this same API with `include=essentials`, a simplified
// 80/20/5-point subset. This adapter calls the full ranker instead: 127
// checks across four layers (discovery, access, usability, payments),
// including the payments layer is-agentic's docs-oriented subset skips
// entirely. See https://ora.ai/blog/is-agentic-with-vercel.
//
// No CLI exists for Ora, so unlike afdocs.js/is-agentic.js this calls the
// public REST API directly instead of going through npx-runner.js (that
// helper is only for wrapping CLIs). The API is keyless for reads — no auth
// needed — but is rate-limited (10/min burst, 30/day, 6 force-scans/day per
// https://ora.ai/docs), so `force` defaults to off to let its own 6-hour
// cache absorb repeated scans of the same URL.
const SCAN_ENDPOINT = "https://ora.ai/api/scan";

/**
 * Runs a scan via Ora's public API and returns both the normalized result
 * and the raw JSON Ora produced. `format=audit` pins the response to Ora's
 * documented, versioned schema.
 */
export async function runOraScan(url, { force = false } = {}) {
  const parsed = new URL(url); // throws on malformed input
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Refusing to scan non-http(s) URL: ${url}`);
  }

  const res = await fetch(`${SCAN_ENDPOINT}?format=audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: parsed.toString(), force }),
  });

  const text = await res.text();
  if (res.status === 429) {
    throw new Error(rateLimitMessage(res, text));
  }
  if (!res.ok) {
    throw new Error(`Ora scan request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`);
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (parseError) {
    throw new Error(`Ora produced non-JSON output: ${parseError.message}`);
  }

  return { normalized: normalize(raw), raw };
}

// A 429 is the one Ora failure a user can actually do something about, and
// the raw status line doesn't say what was exceeded or for how long — so
// spell out the quotas and echo Ora's own `Retry-After` instead of making
// someone go read the docs mid-scan. The quotas are per-IP, and cache hits
// don't consume them, which is exactly why `force` defaults to off above.
function rateLimitMessage(res, body) {
  const retryAfter = res.headers.get("retry-after");
  const wait = retryAfter
    ? `Retry after ${retryAfter}s (Ora's own Retry-After header).`
    : "Retry in a minute; if it persists, the daily quota is likely exhausted.";
  return (
    `Ora rate limit hit (HTTP 429). ${wait}\n` +
    "  Ora's public scan API is keyless but capped per IP: 10 scans/minute burst, " +
    "30 scans per rolling 24h, 6 force (cache-bypassing) scans per rolling 24h.\n" +
    "  Responses served from Ora's 6-hour freshness cache don't consume quota, so re-scanning " +
    "the same URL is usually free — a burst of *distinct* URLs is what exhausts it. (siteready " +
    "never sends force:true, so the force quota isn't what you hit.)\n" +
    "  Limits documented at https://ora.ai/docs" +
    (body ? `\n  Ora said: ${body.slice(0, 300)}` : "")
  );
}

// Ora's check statuses don't line up 1:1 with our pass/warn/fail/skip/error
// vocabulary — "na" (not applicable) and "pending" (still resolving, see
// analysisStatus/pendingChecks) both read as "nothing to act on" here.
const STATUS_MAP = {
  pass: "pass",
  fail: "fail",
  warning: "warn",
  na: "skip",
  pending: "skip",
  error: "error",
};

function normalize(raw) {
  const layers = raw.layers ?? [];
  const checks = layers.flatMap((layer) =>
    (layer.checks ?? []).map((c) => ({
      id: c.id,
      category: layer.id,
      status: STATUS_MAP[c.status] ?? "skip",
      message: c.details ?? c.name,
      fix: c.recommendation ?? null,
      earnedScore: c.score ?? null,
      maxScore: c.maxScore ?? null,
    }))
  );

  const summary = checks.reduce(
    (acc, c) => {
      acc.total++;
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, pass: 0, warn: 0, fail: 0, skip: 0, error: 0 }
  );

  const categoryScores = Object.fromEntries(
    layers.map((l) => [l.id, { score: `${l.score}/${l.maxScore}`, grade: gradeFromRatio(l.score, l.maxScore) }])
  );

  return {
    scanner: "ora",
    // Ora's own `url` field is its report-page URL (e.g.
    // "https://ora.ai/vercel.com"), not the scanned site — `finalUrl` is the
    // actually-scanned target (post-redirects).
    reportUrl: raw.url ?? null,
    target: raw.finalUrl ?? raw.domain,
    scannedAt: raw.scannedAt,
    analysisStatus: raw.analysisStatus,
    score: typeof raw.score === "number" ? { overall: raw.score, grade: raw.grade } : null,
    categoryScores,
    summary,
    checks,
  };
}

function gradeFromRatio(earned, available) {
  if (!available) return "—";
  const pct = (earned / available) * 100;
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}
