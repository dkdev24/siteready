import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

// Hand-rolled markdown mirror: serves each post's raw body verbatim on
// request. Deliberately doesn't apply Astro's remark-smartypants transform —
// only the rendered-HTML route above gets that.
export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getCollection('posts');
	return posts.map((post) => ({
		params: { slug: post.id.replace(/\.md$/, '') },
		props: { post },
	}));
};

export const GET: APIRoute = ({ props }) => {
	const { post } = props as { post: Awaited<ReturnType<typeof getCollection>>[number] };
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(post.data.title)}`,
		post.data.description ? `description: ${JSON.stringify(post.data.description)}` : null,
		'---',
	]
		.filter(Boolean)
		.join('\n');

	return new Response(`${frontmatter}\n\n${post.body ?? ''}`, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
};
