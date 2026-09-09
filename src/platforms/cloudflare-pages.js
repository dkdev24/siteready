import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Cloudflare Pages' static `_headers`/`_redirects` files can't branch on a
// request header, so `Accept: text/markdown` negotiation needs a Pages
// Function rather than static config.
// `functions/` must live at the deploy root (a sibling of the build output
// dir), not inside it — `wrangler pages deploy <dist>` picks it up from
// there automatically.
const MIDDLEWARE = `// Cloudflare Pages Function: serves the pre-built \`.md\` sibling of any page
// when the request asks for it via \`Accept: text/markdown\` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode).
// Static \`_headers\`/\`_redirects\` can't branch on a request header, so this
// has to be a Function rather than a static config file.
export async function onRequest(context) {
	const { request, next, env } = context;
	const accept = request.headers.get('Accept') ?? '';

	if (accept.includes('text/markdown')) {
		const url = new URL(request.url);
		let pathname = url.pathname.replace(/\\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : \`\${pathname}.md\`;
		const mdRequest = new Request(new URL(mdPath, url.origin), request);
		const mdResponse = await env.ASSETS.fetch(mdRequest);

		if (mdResponse.ok) {
			const headers = new Headers(mdResponse.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			return new Response(mdResponse.body, { status: mdResponse.status, headers });
		}
	}

	const response = await next();
	const headers = new Headers(response.headers);
	headers.append('Vary', 'Accept');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
`;

/**
 * Applies the Cloudflare Pages platform-side fix: a `functions/_middleware.js`
 * that serves the framework fixer's `.md` mirrors on `Accept: text/markdown`.
 * Skips (never overwrites) if a `_middleware.js` OR `_middleware.ts` already
 * exists — Cloudflare Pages Functions accept either extension, so a `.ts`
 * middleware is this repo's own and blind-writing `.js` alongside it just
 * duplicates the file. Never writes to git — see `astro-starlight.js`'s
 * docstring.
 */
export async function applyCloudflarePagesFixes(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const functionsDir = path.join(repoPath, "functions");
  const middlewarePath = path.join(functionsDir, "_middleware.js");
  const existing = ["_middleware.js", "_middleware.ts"]
    .map((name) => path.join(functionsDir, name))
    .find(existsSync);
  if (existing) {
    skipped.push(`${existing} (already exists — not overwritten; merge the negotiation logic in manually if wanted)`);
  } else {
    await mkdir(functionsDir, { recursive: true });
    await writeFile(middlewarePath, MIDDLEWARE, "utf8");
    written.push(middlewarePath);
  }

  return { written, skipped, warnings };
}
