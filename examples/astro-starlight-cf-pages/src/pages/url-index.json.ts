import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * Machine-readable URL index.
 *
 * Consumed by the Cloudflare Pages middleware to resolve a near-miss URL — a
 * plausible-but-wrong path — to the canonical page instead of returning a bare
 * 404. Agents routinely guess a flattened or shortened version of a nested docs
 * tree (`/<product>/<page>/` for a page that actually lives at
 * `/<section>/<product>/<page>/`), and a hard 404 on those sends them off to a
 * search engine to rediscover URLs this site already publishes.
 *
 * Also useful on its own as a JSON list of every canonical URL, for anything
 * that would otherwise scrape `/llms.txt`.
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
	const withoutExt = id.replace(/\.(md|mdx)$/, '');
	if (withoutExt === 'index') return '';
	return withoutExt.replace(/\/index$/, '');
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
		(pages[last] ??= []).push(`/${slug}/`);
		// Every ancestor directory is a browsable URL too, so a request that
		// names only a section can still land somewhere real.
		for (let i = 1; i <= segments.length; i++) {
			directories.add(`/${segments.slice(0, i).join('/')}/`);
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
