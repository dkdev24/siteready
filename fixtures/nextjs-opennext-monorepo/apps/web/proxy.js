// Serves the pre-built `.md` sibling of a page when the request asks for it
// via `Accept: text/markdown` (the negotiation several agent clients use:
// Claude Code, Cursor, OpenCode). A static headers/rewrites config can't
// branch on a request header, so this has to run as Proxy.
import { NextResponse } from 'next/server';

export default async function proxy(request) {
	const accept = request.headers.get('accept') ?? '';

	if (accept.includes('text/markdown')) {
		const url = new URL(request.url);
		const pathname = url.pathname.replace(/\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : `${pathname}.md`;
		const mdResponse = await fetch(new URL(mdPath, url.origin));

		if (mdResponse.ok) {
			const headers = new Headers(mdResponse.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			return new Response(mdResponse.body, { status: mdResponse.status, headers });
		}
	}

	// NextResponse.next() continues to normal routing without re-entering this
	// file; self-fetching the original request would recurse back through it.
	const response = NextResponse.next();
	response.headers.append('Vary', 'Accept');
	return response;
}
