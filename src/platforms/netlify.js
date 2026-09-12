import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Netlify's static `netlify.toml` headers/redirects can't branch on a
// request header, so `Accept: text/markdown` negotiation needs an Edge
// Function instead. Declaring `config.path` inline (rather than a
// `[[edge_functions]]` block in netlify.toml) means dropping this one file
// under `netlify/edge-functions/` is enough — no netlify.toml edit needed,
// so there's nothing to skip/merge there.
const EDGE_FUNCTION = `// Netlify Edge Function: serves the pre-built \`.md\` sibling of any page
// when the request asks for it via \`Accept: text/markdown\` (the negotiation
// mechanism several agent clients use — Claude Code, Cursor, OpenCode) or
// when the User-Agent identifies a known AI crawler, which rarely sends
// \`Accept: text/markdown\` itself. Static \`netlify.toml\` headers/redirects
// can't branch on a request header, so this has to be an Edge Function.
const BOT_UA = /GPTBot|ClaudeBot|ChatGPT-User|PerplexityBot|Google-Extended|Applebot-Extended|CCBot|Bytespider|DeepSeekBot/i;

export default async (request, context) => {
	const accept = request.headers.get('Accept') ?? '';
	const userAgent = request.headers.get('User-Agent') ?? '';
	const wantsMarkdown = accept.includes('text/markdown') || BOT_UA.test(userAgent);

	if (wantsMarkdown) {
		const url = new URL(request.url);
		const pathname = url.pathname.replace(/\\/$/, '');
		const mdPath = pathname === '' ? '/index.md' : \`\${pathname}.md\`;
		// A bare self-fetch, not context.next() — the .md path is a plain
		// static asset, and this request carries no Accept: text/markdown /
		// bot User-Agent of its own, so re-entering this same Edge Function
		// (config.path is "/*") takes the non-markdown branch below and just
		// serves the file, rather than looping.
		const mdResponse = await fetch(new URL(mdPath, url.origin));

		if (mdResponse.ok) {
			const headers = new Headers(mdResponse.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			headers.append('Vary', 'User-Agent');
			return new Response(mdResponse.body, { status: mdResponse.status, headers });
		}

		// No \`.md\` sibling for this path — a markdown-preferring request should
		// never fall through to the HTML 404 page. Serve the site's own
		// \`/404.md\` mirror (if one was built) with a real 404 status instead.
		const notFound = await fetch(new URL('/404.md', url.origin));
		if (notFound.ok) {
			const headers = new Headers(notFound.headers);
			headers.set('Content-Type', 'text/markdown; charset=utf-8');
			headers.append('Vary', 'Accept');
			headers.append('Vary', 'User-Agent');
			return new Response(notFound.body, { status: 404, headers });
		}
	}

	const response = await context.next();
	const headers = new Headers(response.headers);
	headers.append('Vary', 'Accept');
	headers.append('Vary', 'User-Agent');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

export const config = { path: '/*' };
`;

/**
 * Applies the Netlify platform-side fix: a `netlify/edge-functions/
 * markdown-negotiation.js` that serves the framework fixer's `.md` mirrors
 * on `Accept: text/markdown` or a known AI-bot User-Agent, falling back to
 * the `/404.md` mirror (instead of the HTML 404) when a markdown-preferring
 * request hits a dead path. Skips (never overwrites) if that file already
 * exists. Never writes to git — see `astro-starlight.js`'s docstring.
 */
export async function applyNetlifyFixes(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const edgeFunctionsDir = path.join(repoPath, "netlify", "edge-functions");
  const targetPath = path.join(edgeFunctionsDir, "markdown-negotiation.js");

  if (existsSync(targetPath)) {
    skipped.push(`${targetPath} (already exists — not overwritten; merge the negotiation logic in manually if wanted)`);
  } else {
    await mkdir(edgeFunctionsDir, { recursive: true });
    await writeFile(targetPath, EDGE_FUNCTION, "utf8");
    written.push(targetPath);
  }

  return { written, skipped, warnings };
}
