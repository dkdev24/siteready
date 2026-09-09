import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NEAR_MISS_RESOLVER } from "../fixers/near-miss.js";

// The middleware carries two agent-readiness behaviors: `Accept: text/markdown`
// content negotiation, and near-miss path resolution (see `../fixers/near-miss.js`).
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

	// A 404 on a plausible-but-wrong path is a dead end for an agent. Try to
	// resolve it to the real page before giving up. No-ops on a site with no
	// /url-index.json.
	if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
		const redirect = await resolveNearMiss(new URL(request.url), env);
		if (redirect) return Response.redirect(redirect, 301);
	}

	const headers = new Headers(response.headers);
	headers.append('Vary', 'Accept');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

${NEAR_MISS_RESOLVER}
`;

// Cloudflare Pages resolves `functions/_middleware.<ext>` by route, not by
// filename, so `_middleware.js` and `_middleware.ts` are the *same* route —
// shipping both is a collision, not two middlewares. Checking only for the
// exact filename we write is therefore not enough: a repo whose middleware is
// written in TypeScript would get a second file silently added beside it, and
// whatever that existing file did (CORS, redirects, auth) would be at the mercy
// of which one the build picks. Guard on every extension Pages accepts.
const MIDDLEWARE_EXTENSIONS = ["js", "mjs", "jsx", "ts", "tsx"];

function findExistingMiddleware(repoPath) {
  return MIDDLEWARE_EXTENSIONS.map((ext) =>
    path.join(repoPath, "functions", `_middleware.${ext}`)
  ).filter((candidate) => existsSync(candidate));
}

/**
 * Applies the Cloudflare Pages platform-side fix: a `functions/_middleware.js`
 * that serves the framework fixer's `.md` mirrors on `Accept: text/markdown`.
 * Skips (never overwrites) if a root middleware already exists in *any*
 * extension — this repo's own middleware may already do something else, and
 * adding a second file on the same route risks both clobbering that behavior
 * and failing the Pages build. Never writes to git — see `astro-starlight.js`'s
 * docstring.
 */
export async function applyCloudflarePagesFixes(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const middlewarePath = path.join(repoPath, "functions", "_middleware.js");
  const existing = findExistingMiddleware(repoPath);

  if (existing.length > 0) {
    skipped.push(
      `${middlewarePath} (${existing.join(", ")} already claims this route — not overwritten)`
    );
    warnings.push(
      `${existing[0]} already exists, so markdown content negotiation and near-miss path ` +
        "resolution were NOT installed. Both are additive branches — copy them out of " +
        "`src/platforms/cloudflare-pages.js` (the `MIDDLEWARE` template) into your existing " +
        "middleware if you want them. The `/url-index.json` route the resolver reads was still " +
        "written, and is harmless on its own."
    );
    if (existing.length > 1) {
      warnings.push(
        `Multiple root middleware files found (${existing.join(", ")}). Cloudflare Pages routes ` +
          "them all to the same path — keep exactly one, or the deployed behavior depends on which " +
          "file the build happens to pick."
      );
    }
  } else {
    await mkdir(path.dirname(middlewarePath), { recursive: true });
    await writeFile(middlewarePath, MIDDLEWARE, "utf8");
    written.push(middlewarePath);
  }

  return { written, skipped, warnings };
}
