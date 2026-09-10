// Site-type filtering (NEXT_ACTIONS.md #10): scope which checks count toward
// the score by what kind of site was scanned, so API-surface checks don't
// drag down a pure content/docs site's grade just because it was never going
// to have a public API.
//
// is-agentic and Ora share one check catalog — is-agentic calls Ora's own API
// with `include=essentials` (see scanners/ora.js) — so one id->applicability
// map covers both scanners' check ids. afdocs' checks (content-discoverability,
// markdown-availability, page-size, content-structure, url-stability,
// observability, authentication) are all inherently content/doc-site checks,
// so none of them need excluding — the map below only needs entries for the
// other two scanners.
//
// This is deliberately NOT a full classification of Ora's ~184 checks (fetched
// live from https://ora.ai/api/checks on 2026-09-10). Most of the rest — MCP,
// GraphQL, accessibility, discovery-layer checks — are either broadly
// applicable regardless of site type or need product-specific judgment this
// tool has no authority to guess. Scope here is the Payments layer (entirely
// commerce/API-protocol specific) plus the API-transport checks this feature
// was built to address — see NEXT_ACTIONS.md #10 and ISSUES.md's
// `is-agentic` score-volatility entry. Extend this set as more
// not-applicable-check reports come in.
const NOT_APPLICABLE_TO_CONTENT = new Set([
  // Usability layer — only meaningful if the site exposes a public REST/GraphQL API
  "public-api",
  "openapi-spec",
  "oauth-support",
  "scoped-permissions",
  "developer-portal",
  "rate-limit-headers",
  "idempotency-key-support",
  "json-error-responses",
  "api-error-model",
  "api-versioning-policy",
  "pagination-shape",
  "async-job-pattern",
  "response-schema-coverage",
  "batch-endpoints",
  "sandbox-environment",
  "cli-tool",
  "rest-sdk-packages",
  "graphql-error-type-definition",
  "graphql-versioning-policy",
  "graphql-pagination-pattern",
  "graphql-async-job-pattern",
  "graphql-schema-completeness",
  "graphql-batch-mutations",
  "api-schema-analysis",
  // Payments layer — entirely commerce/API-protocol specific
  "mpp-support",
  "x402-support",
  "web-bot-auth-directory",
  "api-catalog-rfc9727",
  "oauth-protected-resource",
  "ucp-support",
  "acp-support",
  "acp-delegate-payment",
  "ap2-support",
]);

export const SITE_TYPES = ["content", "api", "application"];

export function isApplicable(checkId, siteType) {
  if (!siteType || siteType === "auto") return true;
  if (!SITE_TYPES.includes(siteType)) {
    throw new Error(`Unknown site type: ${siteType}. Supported: ${SITE_TYPES.join(", ")}, auto`);
  }
  // Only "content" currently excludes anything — see NEXT_ACTIONS.md #10:
  // the ask was keeping API-surface checks off a content site's grade, not
  // the reverse.
  return siteType !== "content" || !NOT_APPLICABLE_TO_CONTENT.has(checkId);
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

/**
 * Marks each check `applicable: true|false` for the given site type and, for
 * scanners that report per-check point weights (afdocs, ora — is-agentic
 * never does; its checks always carry `earnedScore: null, maxScore: null`),
 * recomputes `score.overall` net of the excluded checks. `summary` is left
 * as the scanner reported it (it may still count not-applicable checks) —
 * `notApplicable` names exactly what was excluded so nothing is hidden.
 */
export function applySiteTypeFilter(normalized, siteType) {
  if (!siteType || siteType === "auto") return normalized;

  const checks = normalized.checks.map((c) => ({ ...c, applicable: isApplicable(c.id, siteType) }));
  const applicableChecks = checks.filter((c) => c.applicable);
  const notApplicable = checks.filter((c) => !c.applicable);
  const hasPerCheckWeights = checks.some((c) => c.maxScore != null);

  let score = normalized.score;
  let scoreAdjustedForSiteType = false;
  if (notApplicable.length && hasPerCheckWeights) {
    const earned = applicableChecks.reduce((sum, c) => sum + (c.earnedScore ?? 0), 0);
    const max = applicableChecks.reduce((sum, c) => sum + (c.maxScore ?? 0), 0);
    if (max > 0) {
      score = { overall: Math.round((earned / max) * 100), grade: gradeFromRatio(earned, max) };
      scoreAdjustedForSiteType = true;
    }
  }

  return {
    ...normalized,
    checks,
    score,
    scoreAdjustedForSiteType,
    notApplicable: notApplicable.map((c) => ({ id: c.id, category: c.category, status: c.status, message: c.message })),
  };
}
