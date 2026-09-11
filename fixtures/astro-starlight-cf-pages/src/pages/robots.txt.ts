import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	const sitemapUrl = new URL('sitemap-index.xml', site);
	const schemaMapUrl = new URL('schema-map.xml', site);
	const body = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl.href}
schemamap: ${schemaMapUrl.href}
`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
