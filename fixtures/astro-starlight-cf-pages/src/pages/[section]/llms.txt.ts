import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { buildSectionBody, sectionsOf, txtResponse } from '../../lib/llms-index';

export const getStaticPaths: GetStaticPaths = async () => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');
	return sectionsOf(docs).map((section) => ({ params: { section } }));
};

export const GET: APIRoute = async ({ params }) => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');

	const lines = [
		`# ${params.section} documentation`,
		'',
		'> See /llms.txt for the full site index.',
		'',
		...buildSectionBody(docs, params.section as string),
	];

	return txtResponse(lines);
};
