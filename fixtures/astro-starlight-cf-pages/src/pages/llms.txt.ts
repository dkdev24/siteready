import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildSectionBody, sectionsOf, txtResponse } from '../lib/llms-index';

// llms.txt convention wants every page listed, but also wants the file to
// stay small — the two only conflict once a site has enough pages that a
// flat listing would blow past a reasonable size. Below the threshold this
// lists every page directly (full coverage, small site); past it, listing
// every page inline would make the index itself unusably large, so it
// switches to a short navigation index pointing at /llms-full.txt and one
// /<section>/llms.txt per top-level content directory instead.
const SIZE_THRESHOLD = 20_000;

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');
	const fullBody = buildSectionBody(docs).join('\n');

	if (fullBody.length <= SIZE_THRESHOLD) {
		return txtResponse([
			'# Documentation',
			'',
			'> Machine-readable index of this site\'s documentation, generated at build time.',
			'',
			fullBody,
		]);
	}

	const sections = sectionsOf(docs);
	return txtResponse([
		'# Documentation',
		'',
		'> Machine-readable index of this site\'s documentation, generated at build time.',
		'> This is a navigation index — see the scoped indexes below, or the full listing, for individual pages.',
		'',
		'## Scoped indexes',
		'',
		...sections.map((section) => `- [${section}](/${section}/llms.txt)`),
		'- [Full index](/llms-full.txt) — every page in one file.',
		'',
	]);
};
