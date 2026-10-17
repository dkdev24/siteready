// agent-headers: an in-house check, no external CLI or API. Every other
// scanner tests one request pattern at a time (a page with
// `Accept: text/markdown`, a `.md` URL with no Accept header, ...) and follows
// redirects, so a server that breaks only for the headers real agents send
// still passes. This one fetches each kind of URL a site's llms.txt points at
// with real agent headers, without following redirects, and fails when the
// response is worse than what a plain request gets.

const PROFILES = {
  // Claude Code's WebFetch, as observed against a header-echo service.
  "markdown-accept": {
    Accept: "text/markdown, text/html, */*",
    "User-Agent": "Claude-User (claude-code; +https://support.anthropic.com/)",
  },
  // AI crawlers send a browser-style Accept; servers key markdown on the UA.
  "ai-crawler": {
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  },
};

const PLAIN = { "User-Agent": "siteready (+https://github.com/dkdev24/siteready)" };
const PER_KIND = 5;

const KINDS = [
  { id: "agent-headers-index-files", label: "index files (.txt/.json/.xml)" },
  { id: "agent-headers-md-links", label: ".md links" },
  { id: "agent-headers-pages", label: "pages" },
  { id: "agent-headers-well-known", label: "robots.txt / sitemap.xml" },
];

/**
 * Runs the agent-headers check against a URL. `fetchImpl` is injectable for
 * the self-check in scripts/check-agent-headers.js.
 */
export async function runAgentHeadersScan(url, { fetchImpl = fetch } = {}) {
  const base = new URL(url); // throws on malformed input
  if (!["http:", "https:"].includes(base.protocol)) {
    throw new Error(`Refusing to scan non-http(s) URL: ${url}`);
  }

  const get = (target, headers) => fetchImpl(target, { headers, redirect: "manual" });
  // Status and headers are all we compare; drop the body so sockets are freed.
  const probe = async (target, headers) => {
    const res = await get(target, headers);
    await res.body?.cancel();
    return res;
  };
  const urlsByKind = await collectUrls(base, get);
  const results = [];

  for (const kind of KINDS) {
    const urls = urlsByKind[kind.id];
    if (!urls.length) {
      results.push({ kind, status: "skip", message: `No ${kind.label} found to test` });
      continue;
    }
    const failures = [];
    for (const target of urls) {
      const plain = await probe(target, PLAIN);
      if (!plain.ok) continue; // only compare against a URL that works for a plain request
      for (const [profile, headers] of Object.entries(PROFILES)) {
        const res = await probe(target, headers);
        const problem = describeProblem(target, res);
        if (problem) failures.push(`${new URL(target).pathname} (${profile}): ${problem}`);
      }
    }
    results.push({
      kind,
      status: failures.length ? "fail" : "pass",
      message: failures.length
        ? `${failures.length} broken for agent headers (plain request works): ${failures.slice(0, 5).join("; ")}`
        : `${urls.length} ${kind.label} serve agents the same as a plain request`,
    });
  }

  const raw = { target: base.toString(), urlsByKind, results: results.map((r) => ({ id: r.kind.id, status: r.status, message: r.message })) };
  return { normalized: normalize(raw), raw };
}

// A redirect to the same path with or without a trailing slash is fine;
// anything else sends the agent somewhere it didn't ask for.
function describeProblem(target, res) {
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) return `${res.status} with no Location`;
    const from = new URL(target).pathname.replace(/\/$/, "");
    const to = new URL(location, target).pathname.replace(/\/$/, "");
    return from === to ? null : `${res.status} → ${to || "/"}`;
  }
  return res.ok ? null : `${res.status}`;
}

async function collectUrls(base, get) {
  const origin = base.origin;
  const byKind = Object.fromEntries(KINDS.map((k) => [k.id, []]));
  const add = (id, u) => {
    if (byKind[id].length < PER_KIND && !byKind[id].includes(u)) byKind[id].push(u);
  };
  const readText = async (u) => {
    const res = await get(u, PLAIN);
    if (res.ok) return res.text();
    await res.body?.cancel();
    return null;
  };

  add("agent-headers-pages", base.toString());
  add("agent-headers-well-known", new URL("/robots.txt", origin).toString());
  add("agent-headers-well-known", new URL("/sitemap.xml", origin).toString());

  // llms.txt sits under the target's path on a subfolder-hosted site, else at the root.
  const indexes = [];
  for (const candidate of new Set([new URL("llms.txt", base).toString(), new URL("/llms.txt", origin).toString()])) {
    const text = await readText(candidate);
    if (text != null) {
      indexes.push([candidate, text]);
      break;
    }
  }

  // Follow llms*.txt indexes linked from the root one, one level deep: large
  // sites split their index, and the per-page .md links often live only there.
  for (let i = 0; i < indexes.length; i++) {
    const [indexUrl, text] = indexes[i];
    add("agent-headers-index-files", indexUrl);
    for (const href of extractLinks(text, origin)) {
      const { pathname } = new URL(href);
      if (/\.md$/i.test(pathname)) add("agent-headers-md-links", href);
      else if (/\.(txt|json|xml)$/i.test(pathname)) {
        add("agent-headers-index-files", href);
        const nested = i === 0 && /\/llms[^/]*\.txt$/i.test(pathname) && indexes.length < 4;
        if (nested && !indexes.some(([u]) => u === href)) {
          const nestedText = await readText(href);
          if (nestedText != null) indexes.push([href, nestedText]);
        }
      } else if (!/\.[a-z0-9]+$/i.test(pathname)) add("agent-headers-pages", href);
    }
  }
  return byKind;
}

// Same-origin links in document order (deterministic, so a rescan tests the
// same URLs): bare absolute URLs and root-relative markdown link targets.
function extractLinks(text, origin) {
  const links = [];
  for (const match of text.matchAll(/https?:\/\/[^\s)<>"']+|\]\((\/[^\s)]+)\)/g)) {
    let link;
    try {
      link = new URL((match[1] ?? match[0]).replace(/[.,:;]+$/, ""), origin);
    } catch {
      continue;
    }
    if (link.origin !== origin) continue;
    link.hash = "";
    links.push(link.toString());
  }
  return links;
}

function normalize(raw) {
  const checks = raw.results.map((r) => ({
    id: r.id,
    category: "agent-headers",
    status: r.status,
    message: r.message,
    fix:
      r.status === "fail"
        ? "Serve files with their own extension (.md, .txt, .xml) as-is in your markdown-negotiation middleware, and don't redirect agents to a different path; re-run `siteready enhance` for the fixed Cloudflare Pages/Netlify middleware."
        : null,
    earnedScore: r.status === "pass" ? 1 : 0,
    maxScore: r.status === "skip" ? 0 : 1,
  }));

  const summary = checks.reduce(
    (acc, c) => {
      acc.total++;
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, pass: 0, warn: 0, fail: 0, skip: 0, error: 0 }
  );

  const tested = summary.pass + summary.fail;
  const overall = tested ? Math.round((summary.pass / tested) * 100) : null;
  return {
    scanner: "agent-headers",
    target: raw.target,
    scannedAt: new Date().toISOString(),
    score: overall == null ? null : { overall, grade: gradeFromScore(overall) },
    categoryScores: {},
    summary,
    checks,
  };
}

function gradeFromScore(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}
