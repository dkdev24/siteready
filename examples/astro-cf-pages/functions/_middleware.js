// Cloudflare Pages Function: serves the pre-built `.md` sibling of any page
// when the request asks for it via `Accept: text/markdown` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode).
// Static `_headers`/`_redirects` can't branch on a request header, so this
// has to be a Function rather than a static config file.
export async function onRequest(context) {
	const { request, next, env } = context;
	const accept = request.headers.get('Accept') ?? '';

	if (accept.includes('text/markdown')) {
		const url = new URL(request.url);
		let pathname = url.pathname.replace(/\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : `${pathname}.md`;
		const mdRequest = new Request(new URL(mdPath, url.origin), request);
		const mdResponse = await env.ASSETS.fetch(mdRequest);

		if (mdResponse.ok) {
			const headers = new Headers(mdResponse.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			return new Response(mdResponse.body, { status: mdResponse.status, headers });
		}
	}

	const response = await next();
	const headers = new Headers(response.headers);
	headers.append('Vary', 'Accept');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
