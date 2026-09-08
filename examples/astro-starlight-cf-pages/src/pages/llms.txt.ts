import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\.(md|mdx)$/, '');
	if (withoutExt === 'index') return withoutExt;
	return withoutExt.replace(/\/index$/, '');
}

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');

	// Root-relative links (not astro.config's `site`) so llms.txt keeps
	// resolving correctly regardless of which domain/port actually serves it
	// (production domain, a preview deploy, or a local dev/test server).
	const links = docs
		.map((entry) => {
			const slug = slugFromId(entry.id);
			const href = slug === 'index' ? '/index.md' : `/${slug}.md`;
			const description = entry.data.description ? `: ${entry.data.description}` : '';
			return `- [${entry.data.title}](${href})${description}`;
		})
		.join('\n');

	const body = [
		'# Documentation',
		'',
		'> Machine-readable index of this site\'s documentation, generated at build time.',
		'',
		'## Docs',
		'',
		links,
		'',
	].join('\n');

	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
