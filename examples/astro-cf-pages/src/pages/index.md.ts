import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Raw markdown mirror of the home page, same pattern as posts/[...slug].md.ts.
export const GET: APIRoute = async () => {
	const posts = await getCollection('posts');
	const links = posts.map((post) => `- [${post.data.title}](/posts/${post.id.replace(/\.md$/, '')})`).join('\n');
	const body = `# Welcome\n\nA minimal Astro site with no Starlight, used to exercise the plain-Astro fixer.\n\n${links}\n`;

	return new Response(body, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
};
