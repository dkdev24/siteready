// Vercel Proxy: serves the pre-built `.md` sibling of any page when the
// request asks for it via `Accept: text/markdown` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode).
// vercel.json's static headers/rewrites can't branch on a request header, so
// this has to be Proxy rather than static config.
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

	// NextResponse.next() (not a raw fetch of the request) continues to
	// normal routing without re-entering this Proxy — self-fetching the
	// original request would recurse back through it. This Vary header
	// addition follows Next.js's documented pattern for setting response
	// headers from Proxy, but verified against a real `next start` server
	// (Next.js 16.3.4) it does not survive onto statically-cached HTML
	// responses — only onto the .md response returned above. Left in as a
	// no-op-if-ineffective best effort rather than removed, since it's
	// harmless and may start working on a future Next.js release; the
	// negotiation itself (the part that matters) is unaffected either way.
	const response = NextResponse.next();
	response.headers.append('Vary', 'Accept');
	return response;
}
