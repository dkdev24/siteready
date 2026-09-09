import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Next.js has no equivalent of Astro's content-collection convention, so
// (like astro.js) this fixer sticks to fixes that are safe regardless of
// content shape — no llms.txt, no markdown-mirror generation. See
// astro.js's docstring for why a fixer stays out of anything that requires
// inventing product-specific structure.

const NOT_FOUND_PAGE = `// Next.js App Router convention: app/not-found.js is rendered automatically
// for any unmatched route, both in dev and in \`next start\`.
export default function NotFound() {
	return (
		<html lang="en">
			<head>
				<title>Page not found</title>
				<meta name="robots" content="noindex" />
			</head>
			<body>
				<h1>Page not found</h1>
				<p>This page doesn't exist — it may have moved or been renamed.</p>
				<ul>
					<li><a href="/">Home</a></li>
				</ul>
			</body>
		</html>
	);
}
`;

const ROBOTS_TXT = ({ sitemapUrl }) =>
	["User-agent: *", "Allow: /", sitemapUrl ? `\nSitemap: ${sitemapUrl}` : ""].join("\n") + "\n";

/**
 * Applies the Next.js framework-side agent-readiness fixes to a local repo
 * checkout: a real not-found page and a permissive robots.txt. Each
 * generated file is skipped, never overwritten, if the target already has
 * one. Never touches git — see astro-starlight.js's docstring for the same
 * rule.
 */
export async function applyNextjsFixes(repoPath) {
	const written = [];
	const skipped = [];
	const warnings = [];

	const appDir = ["app", "src/app"].map((d) => path.join(repoPath, d)).find(existsSync);
	if (!appDir) {
		warnings.push(`No app/ (or src/app/) directory found under ${repoPath} — Pages Router isn't supported yet, skipping not-found page.`);
	} else {
		await writeIfAbsent(path.join(appDir, "not-found.js"), NOT_FOUND_PAGE, written, skipped);
	}

	// next-sitemap is the common convention for a real sitemap URL on
	// Next.js (the built-in app/sitemap.js Metadata API route has no fixed
	// literal URL to read out without executing it) — only add the Sitemap
	// line when we can find one, same null-fallback pattern as astro.js.
	const sitemapConfigPath = ["next-sitemap.config.js", "next-sitemap.config.cjs", "next-sitemap.config.mjs"]
		.map((f) => path.join(repoPath, f))
		.find((f) => existsSync(f));
	const sitemapConfigSource = sitemapConfigPath ? await readFile(sitemapConfigPath, "utf8") : "";
	const siteUrlMatch = sitemapConfigSource.match(/siteUrl\s*:\s*(['"`])((?:(?!\1).)*)\1/);
	const sitemapUrl = siteUrlMatch ? `${siteUrlMatch[2].replace(/\/$/, "")}/sitemap.xml` : null;

	await writeIfAbsent(path.join(repoPath, "public/robots.txt"), ROBOTS_TXT({ sitemapUrl }), written, skipped);

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
