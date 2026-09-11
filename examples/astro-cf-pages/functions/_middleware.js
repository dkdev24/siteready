// Cloudflare Pages Function: serves the pre-built `.md` sibling of any page
// when the request asks for it via `Accept: text/markdown` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode) or
// when the User-Agent identifies a known AI crawler, which rarely sends
// `Accept: text/markdown` itself. Static `_headers`/`_redirects` can't
// branch on a request header, so this has to be a Function rather than a
// static config file.
const BOT_UA = /GPTBot|ClaudeBot|ChatGPT-User|PerplexityBot|Google-Extended|Applebot-Extended|CCBot|Bytespider|DeepSeekBot/i;

export async function onRequest(context) {
	const { request, next, env } = context;
	const accept = request.headers.get('Accept') ?? '';
	const userAgent = request.headers.get('User-Agent') ?? '';
	const wantsMarkdown = accept.includes('text/markdown') || BOT_UA.test(userAgent);

	if (wantsMarkdown) {
		const url = new URL(request.url);
		let pathname = url.pathname.replace(/\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : `${pathname}.md`;
		const mdRequest = new Request(new URL(mdPath, url.origin), request);
		const mdResponse = await env.ASSETS.fetch(mdRequest);

		if (mdResponse.ok) {
			const headers = new Headers(mdResponse.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			headers.append('Vary', 'User-Agent');
			return new Response(mdResponse.body, { status: mdResponse.status, headers });
		}

		// No `.md` sibling for this path — a markdown-preferring request should
		// never fall through to the HTML 404 page. Serve the site's own
		// `/404.md` mirror (if one was built) with a real 404 status instead.
		const notFound = await env.ASSETS.fetch(new URL('/404.md', url.origin));
		if (notFound.ok) {
			const headers = new Headers(notFound.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			headers.append('Vary', 'User-Agent');
			return new Response(notFound.body, { status: 404, headers });
		}
	}

	const response = await next();
	const headers = new Headers(response.headers);
	headers.append('Vary', 'Accept');
	headers.append('Vary', 'User-Agent');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
