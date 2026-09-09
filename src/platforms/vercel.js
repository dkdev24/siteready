import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Vercel's static `headers`/`rewrites` in vercel.json can't branch on a
// request header, so `Accept: text/markdown` negotiation needs Proxy
// instead. `proxy.js` must live at the project root (or `src/` if the
// project uses a src dir) — Next.js only recognizes it there. This is the
// current file convention (Next.js 16+ renamed `middleware.js` to
// `proxy.js`, same default-export shape) — see
// https://nextjs.org/docs/messages/middleware-to-proxy.
const PROXY = `// Vercel Proxy: serves the pre-built \`.md\` sibling of any page when the
// request asks for it via \`Accept: text/markdown\` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode).
// vercel.json's static headers/rewrites can't branch on a request header, so
// this has to be Proxy rather than static config.
import { NextResponse } from 'next/server';

export default async function proxy(request) {
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

	// NextResponse.next() (not a raw fetch of the request) continues to
	// normal routing without re-entering this Proxy — self-fetching the
	// original request would recurse back through it. This Vary header
	// addition follows Next.js's documented pattern for setting response
	// headers from Proxy, but verified against a real \`next start\` server
	// (Next.js 16.3.4) it does not survive onto statically-cached HTML
	// responses — only onto the .md response returned above. Left in as a
	// no-op-if-ineffective best effort rather than removed, since it's
	// harmless and may start working on a future Next.js release; the
	// negotiation itself (the part that matters) is unaffected either way.
	const response = NextResponse.next();
	response.headers.append('Vary', 'Accept');
	return response;
}
`;

/**
 * Applies the Vercel platform-side fix: a root `proxy.js` that serves the
 * framework fixer's `.md` mirrors on `Accept: text/markdown`. Skips (never
 * overwrites) if a `proxy.js`/`.ts` OR the older `middleware.js`/`.ts`
 * already exists, at the repo root OR under `src/` — Next.js accepts either
 * extension, location, or (for now) naming convention, and this repo's own
 * proxy/middleware may already do something else. Never touches git — see
 * `fixers/astro-starlight.js`'s docstring.
 */
export async function applyVercelFixes(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const proxyPath = path.join(repoPath, "proxy.js");
  const existing = ["proxy.js", "proxy.ts", "src/proxy.js", "src/proxy.ts", "middleware.js", "middleware.ts", "src/middleware.js", "src/middleware.ts"]
    .map((name) => path.join(repoPath, name))
    .find(existsSync);
  if (existing) {
    skipped.push(`${existing} (already exists — not overwritten; merge the negotiation logic in manually if wanted)`);
  } else {
    await writeFile(proxyPath, PROXY, "utf8");
    written.push(proxyPath);
  }

  return { written, skipped, warnings };
}
