// Cloudflare Pages Function: serves the pre-built `.md` sibling of any page
// when the request asks for it via `Accept: text/markdown` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode).
// Static `_headers`/`_redirects` can't branch on a request header, so this
// has to be a Function rather than a static config file.
export async function onRequest(context) {
	const { request, next, env } = context;
	const accept = request.headers.get('Accept') ?? '';

	if (accept.includes('text/markdown')) {
		const url = new URL(request.url);
		let pathname = url.pathname.replace(/\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : `${pathname}.md`;
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

// --- near-miss path resolution -------------------------------------------
//
// A plausible-but-wrong URL — a nested tree guessed flat, a product name used
// as a path prefix, a page requested one level too shallow — is a hard 404 by
// default, which is a dead end for an agent: it has no way to recover except
// to leave the site and search for the real URL. On a 404 we look the last
// path segment up in `/url-index.json` (written by the framework fixer) and
// 301 to the canonical page when the match is unambiguous.
//
// Deliberately conservative: a guess we can't resolve confidently falls back
// to the deepest real directory the request names, and failing that renders
// the normal 404 page. It never invents a destination.

let urlIndexCache = null;

async function loadUrlIndex(url, env) {
	if (urlIndexCache !== null) return urlIndexCache;
	try {
		const response = await env.ASSETS.fetch(new URL('/url-index.json', url.origin).toString());
		// No index (e.g. a site whose framework fixer doesn't write one) — cache
		// the miss so every subsequent 404 doesn't re-request it.
		urlIndexCache = response.ok ? await response.json() : false;
	} catch {
		urlIndexCache = false;
	}
	return urlIndexCache;
}

const segmentsOf = (pathname) => pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

async function resolveNearMiss(url, env) {
	const isMarkdown = url.pathname.endsWith('.md');
	const requested = segmentsOf(isMarkdown ? url.pathname.slice(0, -3) : url.pathname);
	if (requested.length === 0) return null;

	const index = await loadUrlIndex(url, env);
	if (!index) return null;

	const aliases = index.aliases ?? {};
	const normalize = (segment) => aliases[segment.toLowerCase()] ?? segment;
	const normalized = requested.map(normalize);
	const directories = new Set(index.directories ?? []);
	const context = new Set(normalized.slice(0, -1));

	let target = null;

	const slug = requested[requested.length - 1];
	let candidates = (index.pages ?? {})[slug] ?? (index.pages ?? {})[normalize(slug)] ?? [];

	// If the request opens with a real top-level directory, only pages under it
	// can be what was meant. On an i18n site this is what keeps a `/<locale>/`
	// request from resolving into the default-locale tree.
	const first = normalized[0];
	if (candidates.length > 1 && directories.has(`/${first}/`)) {
		const scoped = candidates.filter((c) => c.startsWith(`/${first}/`));
		if (scoped.length > 0) candidates = scoped;
	}

	if (candidates.length === 1) {
		target = candidates[0];
	} else if (candidates.length > 1) {
		// Score by how many of the other requested segments each candidate
		// contains, so `/<product>/getting-started/` picks that product's page
		// over an identically-named one elsewhere in the tree.
		let best = 0;
		let winners = [];
		for (const candidate of candidates) {
			const parts = new Set(segmentsOf(candidate));
			let score = 0;
			for (const segment of context) if (parts.has(segment)) score++;
			if (score > best) {
				best = score;
				winners = [candidate];
			} else if (score === best && best > 0) {
				winners.push(candidate);
			}
		}
		// Nothing scored: a single-segment request has no context to score
		// against. Fall through to the depth tie-break over all candidates
		// rather than giving up.
		if (winners.length === 0) winners = candidates;
		// Tie-break on depth: the shallowest match is the canonical one on a
		// site that mirrors its tree under a locale prefix. A tie we still
		// can't break is a guess not worth acting on.
		if (winners.length > 1) {
			const shallowest = Math.min(...winners.map((c) => segmentsOf(c).length));
			winners = winners.filter((c) => segmentsOf(c).length === shallowest);
		}
		if (winners.length === 1) target = winners[0];
	}

	if (!target) {
		// Nothing matched a page. Fall back to the deepest real directory the
		// request names, so the agent lands on a section index it can navigate
		// from rather than on an error.
		for (let i = normalized.length; i > 0; i--) {
			const candidate = `/${normalized.slice(0, i).join('/')}/`;
			if (directories.has(candidate)) {
				target = candidate;
				break;
			}
		}
	}

	if (!target) return null;
	const resolved = isMarkdown ? `${target.replace(/\/$/, '')}.md` : target;
	// Never redirect a path to itself — that would be a loop, and it means the
	// 404 came from something other than a wrong path.
	if (resolved === url.pathname) return null;
	return new URL(resolved + url.search, url.origin).toString();
}

