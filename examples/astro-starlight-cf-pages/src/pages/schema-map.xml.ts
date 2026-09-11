import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	const feedUrl = new URL('/schema-feed.jsonl', site).href;
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:sf="http://schema.org/schemas/schemafeed/0.1">
  <url>
    <loc>${feedUrl}</loc>
    <sf:contentType>structuredData/schema.org</sf:contentType>
  </url>
</urlset>
`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
