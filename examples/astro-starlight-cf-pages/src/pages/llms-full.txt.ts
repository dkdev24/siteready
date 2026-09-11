import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildSectionBody, txtResponse } from '../lib/llms-index';

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');

	const lines = [
		'# Documentation — full index',
		'',
		'> Every documentation page in one file. See /llms.txt for a shorter navigation index.',
		'',
		...buildSectionBody(docs),
	];

	return txtResponse(lines);
};
