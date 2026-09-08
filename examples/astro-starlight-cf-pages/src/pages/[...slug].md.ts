import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\.(md|mdx)$/, '');
	if (withoutExt === 'index') return withoutExt;
	return withoutExt.replace(/\/index$/, '');
}

export const getStaticPaths: GetStaticPaths = async () => {
	const docs = await getCollection('docs');
	return docs.map((entry) => ({
		params: { slug: slugFromId(entry.id) },
		props: { entry },
	}));
};

export const GET: APIRoute = ({ props }) => {
	const { entry } = props as { entry: Awaited<ReturnType<typeof getCollection>>[number] };
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(entry.data.title)}`,
		entry.data.description ? `description: ${JSON.stringify(entry.data.description)}` : null,
		'---',
	]
		.filter(Boolean)
		.join('\n');

	const directive = `> For the complete documentation index, see [llms.txt](/llms.txt).\n\n`;

	return new Response(`${frontmatter}\n\n${directive}${entry.body ?? ''}`, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
};
