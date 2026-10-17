import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Next.js on AWS via OpenNext (SST, cdk-nextjs-standalone, OpenNext's own
// CDK/Terraform): CloudFront in front of a server Lambda plus S3. The
// framework runs its own middleware inside that Lambda, so the same
// `Accept: text/markdown` negotiation as on Vercel works. What differs is
// everything around it: CloudFront's cache key and where `public/` is served
// from. siteready never edits infra code (CDK, SST and Terraform are too
// varied), so those parts are reported as warnings, not written.

const NEGOTIATION = (fn) => `// Serves the pre-built \`.md\` sibling of a page when the request asks for it
// via \`Accept: text/markdown\` (the negotiation several agent clients use:
// Claude Code, Cursor, OpenCode). A static headers/rewrites config can't
// branch on a request header, so this has to run as ${fn === "proxy" ? "Proxy" : "Middleware"}.
import { NextResponse } from 'next/server';

export default async function ${fn}(request) {
	const accept = request.headers.get('accept') ?? '';

	if (accept.includes('text/markdown')) {
		const url = new URL(request.url);
		const pathname = url.pathname.replace(/\\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : \`\${pathname}.md\`;
		const mdResponse = await fetch(new URL(mdPath, url.origin));

		if (mdResponse.ok) {
			const headers = new Headers(mdResponse.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			return new Response(mdResponse.body, { status: mdResponse.status, headers });
		}
	}

	// NextResponse.next() continues to normal routing without re-entering this
	// file; self-fetching the original request would recurse back through it.
	const response = NextResponse.next();
	response.headers.append('Vary', 'Accept');
	return response;
}
`;

const EXISTING = ["proxy", "middleware"].flatMap((n) =>
  ["", "src/"].flatMap((dir) => ["js", "mjs", "ts"].map((ext) => `${dir}${n}.${ext}`))
);

// Next.js 16 renamed `middleware` to `proxy`; 15 and older don't know
// `proxy`, while 16 still accepts (and deprecation-warns on) `middleware`. So
// only a confirmed major >= 16 gets `proxy`; an unreadable version gets the
// file name every version understands.
function nextMajor(siteRoot) {
  const readVersion = (file, pick) => {
    try {
      return pick(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      return null;
    }
  };
  const declared = readVersion(path.join(siteRoot, "package.json"), (p) => p.dependencies?.next ?? p.devDependencies?.next);
  const installed = readVersion(path.join(siteRoot, "node_modules", "next", "package.json"), (p) => p.version);
  const major = parseInt((installed ?? declared ?? "").replace(/^\D*/, ""), 10);
  return Number.isNaN(major) ? null : major;
}

/**
 * Applies the AWS (CloudFront + OpenNext) platform-side fix: a `proxy.js`
 * (Next.js >= 16) or `middleware.js` (older) that serves `.md` siblings on
 * `Accept: text/markdown`. Skips, never overwrites, if the app already has a
 * proxy/middleware (apps with i18n or auth usually do): merging negotiation
 * into existing routing logic is a manual step. Always returns the infra
 * checks siteready can't perform from a local checkout. Never touches git.
 */
export async function applyAwsCloudfrontOpennextFixes(siteRoot) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const existing = EXISTING.map((name) => path.join(siteRoot, name)).find(existsSync);
  if (existing) {
    skipped.push(`${existing} (already exists, not overwritten; merge the Accept: text/markdown negotiation in by hand if wanted. Check that its \`matcher\` doesn't exclude the paths you want negotiated)`);
  } else {
    const fn = (nextMajor(siteRoot) ?? 0) >= 16 ? "proxy" : "middleware";
    const target = path.join(siteRoot, `${fn}.js`);
    await writeFile(target, NEGOTIATION(fn), "utf8");
    written.push(target);
  }

  warnings.push(
    "AWS/OpenNext: CloudFront must include `Accept` in the cache key of the server-function behavior (or " +
      "leave negotiated responses uncacheable), otherwise one cached variant is served to every client, " +
      "possibly markdown to browsers. siteready can't edit or verify your CDK/SST/Terraform cache policy; check it.",
    "AWS/OpenNext: the negotiation self-fetches `/<path>.md`. `public/` files are served by CloudFront from " +
      "S3, not by the server function, so confirm those `.md` URLs resolve on the deployed origin. A local " +
      "`next start` run can't show either point; confirm with `siteready scan` against the deployed URL."
  );

  return { written, skipped, warnings };
}
