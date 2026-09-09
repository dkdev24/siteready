// Near-miss URL resolution: a build-time index of every canonical page URL,
// plus the middleware logic that uses it to turn a 404 on a plausible-but-wrong
// path into a 301 to the real page.
//
// Split out from the framework and platform fixers because it spans both: the
// index is a framework-level route (Astro), the resolver runs at the edge
// (Cloudflare Pages). Neither half is useful alone — without the index the
// resolver no-ops, and without the resolver the index is just a JSON listing.
//
// Why this exists: a scanner journey against a real production docs site found
// an agent failing on every shortened guess at a nested path and falling back
// to a search engine to rediscover URLs the site already published. None of the
// three scanners' checks caught it; only the journey narrative did.

/** Astro route that emits `/url-index.json` from the docs collection. */
export const URL_INDEX_ENDPOINT = `import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * Machine-readable URL index.
 *
 * Consumed by the Cloudflare Pages middleware to resolve a near-miss URL — a
 * plausible-but-wrong path — to the canonical page instead of returning a bare
 * 404. Agents routinely guess a flattened or shortened version of a nested docs
 * tree (\`/<product>/<page>/\` for a page that actually lives at
 * \`/<section>/<product>/<page>/\`), and a hard 404 on those sends them off to a
 * search engine to rediscover URLs this site already publishes.
 *
 * Also useful on its own as a JSON list of every canonical URL, for anything
 * that would otherwise scrape \`/llms.txt\`.
 */

/**
 * Optional: alternative names people and agents use for this site's own
 * directories, mapped to the real segment. Nothing here is guessable by a
 * fixer — fill it in with your own product nicknames and abbreviations, e.g.
 *
 *   const ALIASES: Record<string, string> = {
 *     docs: 'documentation',
 *     api: 'reference',
 *   };
 *
 * An empty table is fine: slug matching below still resolves most near misses.
 */
const ALIASES: Record<string, string> = {};

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\\.(md|mdx)$/, '');
	if (withoutExt === 'index') return '';
	return withoutExt.replace(/\\/index$/, '');
}

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');

	const pages: Record<string, string[]> = {};
	const directories = new Set<string>();

	for (const doc of docs) {
		const slug = slugFromId(doc.id);
		// Skip the site root and the 404 page — neither is a destination worth
		// redirecting a near miss to.
		if (!slug || slug === '404') continue;
		const segments = slug.split('/');
		const last = segments[segments.length - 1];
		(pages[last] ??= []).push(\`/\${slug}/\`);
		// Every ancestor directory is a browsable URL too, so a request that
		// names only a section can still land somewhere real.
		for (let i = 1; i <= segments.length; i++) {
			directories.add(\`/\${segments.slice(0, i).join('/')}/\`);
		}
	}

	for (const slug of Object.keys(pages)) pages[slug].sort();

	return new Response(JSON.stringify({ aliases: ALIASES, directories: [...directories].sort(), pages }), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
`;

/**
 * Resolver source, injected into the Cloudflare Pages middleware template.
 * Plain JS (not TS) — it is embedded in `functions/_middleware.js`.
 */
export const NEAR_MISS_RESOLVER = `// --- near-miss path resolution -------------------------------------------
//
// A plausible-but-wrong URL — a nested tree guessed flat, a product name used
// as a path prefix, a page requested one level too shallow — is a hard 404 by
// default, which is a dead end for an agent: it has no way to recover except
// to leave the site and search for the real URL. On a 404 we look the last
// path segment up in \`/url-index.json\` (written by the framework fixer) and
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

const segmentsOf = (pathname) => pathname.replace(/^\\/+|\\/+$/g, '').split('/').filter(Boolean);

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
	// can be what was meant. On an i18n site this is what keeps a \`/<locale>/\`
	// request from resolving into the default-locale tree.
	const first = normalized[0];
	if (candidates.length > 1 && directories.has(\`/\${first}/\`)) {
		const scoped = candidates.filter((c) => c.startsWith(\`/\${first}/\`));
		if (scoped.length > 0) candidates = scoped;
	}

	if (candidates.length === 1) {
		target = candidates[0];
	} else if (candidates.length > 1) {
		// Score by how many of the other requested segments each candidate
		// contains, so \`/<product>/getting-started/\` picks that product's page
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
			const candidate = \`/\${normalized.slice(0, i).join('/')}/\`;
			if (directories.has(candidate)) {
				target = candidate;
				break;
			}
		}
	}

	if (!target) return null;
	const resolved = isMarkdown ? \`\${target.replace(/\\/$/, '')}.md\` : target;
	// Never redirect a path to itself — that would be a loop, and it means the
	// 404 came from something other than a wrong path.
	if (resolved === url.pathname) return null;
	return new URL(resolved + url.search, url.origin).toString();
}
`;
