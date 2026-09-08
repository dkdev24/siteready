import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Plain-Astro (no Starlight) sites have no built-in content collection
// convention, so unlike astro-starlight.js this fixer can't generate a
// content-aware llms.txt or .md mirror routes without guessing the site's
// own routing scheme — see HANDOFF.md's "when to use this" precedent for why
// a fixer stays out of anything that requires inventing product-specific
// structure. It sticks to fixes that are safe regardless of content shape.

const NOT_FOUND_PAGE = `---
// Astro's own convention: a src/pages/404.astro is used automatically as the
// site's not-found page, both in dev and in a static build's dist/404.html.
---
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>Page not found</title>
		<meta name="robots" content="noindex" />
	</head>
	<body>
		<h1>Page not found</h1>
		<p>This page doesn't exist — it may have moved or been renamed.</p>
		<ul>
			<li><a href="/">Home</a></li>
			<li><a href="/llms.txt">/llms.txt</a> — machine-readable index of this site, if one exists</li>
		</ul>
	</body>
</html>
`;

// Astro's default markdown pipeline runs remark-smartypants, curling straight
// quotes/apostrophes and collapsing "..." on rendered HTML. A hand-rolled
// `.md.ts` route that serves a content collection entry's raw `body` verbatim
// won't have that transform applied, so every quote/apostrophe reads as a
// content difference to a markdown-vs-HTML parity checker (afdocs'
// markdown-content-parity) even though nothing is actually missing — found
// dogfooding against a real site (see WORKLOG). Ships the normalizer as a new
// file only; wiring it into an existing hand-written route is left to the
// user (never edit a file this fixer didn't create — see CONTRIBUTING.md).
const SMART_QUOTES_UTIL = `// Astro's markdown pipeline runs remark-smartypants by default, curling
// straight quotes/apostrophes and collapsing "..." on rendered HTML. A route
// that serves a content collection entry's raw body verbatim won't have that
// transform applied, so every quote/apostrophe reads as a content difference
// to a markdown-vs-HTML parity checker even though nothing is missing. Wrap
// your served markdown body in smartQuotes() to keep the two in sync — skips
// fenced/inline code so snippets aren't touched.
export function smartQuotes(markdown) {
	return markdown
		.split(/(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`]*\`)/)
		.map((chunk, i) =>
			i % 2 === 1
				? chunk
				: chunk
						.replace(/(^|[\\s([{—-])"/g, '$1“')
						.replace(/"/g, '”')
						.replace(/(^|[\\s([{—-])'/g, "$1‘")
						.replace(/'/g, '’')
						.replace(/\\.\\.\\./g, '…')
		)
		.join('');
}
`;

const ROBOTS_TXT = ({ sitemapUrl }) =>
	["User-agent: *", "Allow: /", sitemapUrl ? `\nSitemap: ${sitemapUrl}` : ""].join("\n") + "\n";

/**
 * Applies the plain-Astro (non-Starlight) framework-side agent-readiness
 * fixes to a local repo checkout: a real 404 page, a permissive robots.txt,
 * and — only if the repo already has a hand-rolled markdown-mirror route —
 * a smartQuotes() utility plus a warning to wire it in. Each generated file
 * is skipped, never overwritten, if the target already has one. Never
 * touches git — see astro-starlight.js's docstring for the same rule.
 */
export async function applyAstroFixes(repoPath) {
	const written = [];
	const skipped = [];
	const warnings = [];

	await writeIfAbsent(path.join(repoPath, "src/pages/404.astro"), NOT_FOUND_PAGE, written, skipped);

	const configPath = ["astro.config.mjs", "astro.config.ts", "astro.config.js"]
		.map((f) => path.join(repoPath, f))
		.find((f) => existsSync(f));
	const configSource = configPath ? await readFile(configPath, "utf8") : "";
	const siteMatch = configSource.match(/site\s*:\s*(['"`])((?:(?!\1).)*)\1/);
	const hasSitemapIntegration = /@astrojs\/sitemap/.test(configSource);
	const sitemapUrl = siteMatch && hasSitemapIntegration ? `${siteMatch[2].replace(/\/$/, "")}/sitemap-index.xml` : null;

	await writeIfAbsent(path.join(repoPath, "public/robots.txt"), ROBOTS_TXT({ sitemapUrl }), written, skipped);

	// Only routes that echo a collection entry's raw `.body` back verbatim are
	// exposed to the smartypants mismatch — a listing/index route (titles,
	// links, no prose) never hits it. Filtering on `.body` usage avoids
	// warning about routes that don't need the fix.
	const mdRoutes = await findMarkdownMirrorRoutes(path.join(repoPath, "src/pages"));
	const needsSmartQuotes = mdRoutes.filter((r) => /\.body\b/.test(r.content) && !/smart\s*quotes/i.test(r.content));
	if (needsSmartQuotes.length > 0) {
		const utilPath = path.join(repoPath, "src/utils/smartquotes.ts");
		await writeIfAbsent(utilPath, SMART_QUOTES_UTIL, written, skipped);
		for (const route of needsSmartQuotes) {
			warnings.push(
				`${route.file} serves markdown content but doesn't appear to apply typography normalization — ` +
					"wrap the served body in smartQuotes() from src/utils/smartquotes.ts so it matches Astro's " +
					"default rendered-HTML quotes/apostrophes (afdocs' markdown-content-parity check flags the raw " +
					"vs. curled mismatch as missing content otherwise)."
			);
		}
	}

	return { written, skipped, warnings };
}

async function writeIfAbsent(filePath, content, written, skipped) {
	if (existsSync(filePath)) {
		skipped.push(`${filePath} (already exists)`);
		return;
	}
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
	written.push(filePath);
}

// Bounded recursive scan for hand-rolled markdown-mirror routes (e.g.
// `[slug].md.ts`, `index.md.ts`) under src/pages. Read-only — never used to
// decide what to edit, only what to warn about.
async function findMarkdownMirrorRoutes(pagesDir, depth = 0, out = []) {
	if (depth > 6 || !existsSync(pagesDir)) return out;
	for (const entry of await readdir(pagesDir, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const full = path.join(pagesDir, entry.name);
		if (entry.isDirectory()) {
			await findMarkdownMirrorRoutes(full, depth + 1, out);
		} else if (entry.name.endsWith(".md.ts")) {
			out.push({ file: full, content: await readFile(full, "utf8") });
		}
	}
	return out;
}
