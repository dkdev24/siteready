import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLastmodMap } from '../lib/lastmod';
import { slugFromId } from '../lib/llms-index';

// One schema.org TechArticle per doc page, JSON Lines. `dateModified` is
// best-effort (from git history via buildLastmodMap) and omitted when unknown.
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');
	const lastmodByPath = buildLastmodMap('./src/content/docs');

	const lines = [...docs]
		.sort((a, b) => slugFromId(a.id).localeCompare(slugFromId(b.id)))
		.map((doc) => {
			const slug = slugFromId(doc.id);
			const url = new URL(slug ? `/${slug}/` : '/', site).href;
			const dateModified = lastmodByPath.get(slug ? `/${slug}/` : '/');
			const entry: Record<string, unknown> = {
				'@context': 'https://schema.org',
				'@type': 'TechArticle',
				'@id': url,
				url,
				name: doc.data.title,
			};
			if (doc.data.description) entry.description = doc.data.description;
			if (dateModified) entry.dateModified = dateModified;
			return JSON.stringify(entry);
		});

	return new Response(lines.join('\n') + '\n', {
		headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
	});
};
