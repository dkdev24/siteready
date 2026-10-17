import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next.js has no equivalent of Astro's content-collection convention, so this
// fixer can't read content from source. For `llms.txt` and the `.md` mirrors it
// instead generates from the *build output*: it installs a zero-dependency
// script (src/templates/next-agent-readiness.mjs) and wires it as `postbuild`,
// and that script converts every prerendered page's HTML to markdown after
// `next build`. See the template's header for what it covers and never touches.
// The rest of this file sticks to fixes that are safe regardless of content shape.

const AGENT_SCRIPT_SOURCE = fileURLToPath(new URL("../templates/next-agent-readiness.mjs", import.meta.url));
const AGENT_SCRIPT_PATH = "scripts/agent-readiness.mjs";
const POSTBUILD_COMMAND = `node ${AGENT_SCRIPT_PATH}`;

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
 * checkout: a real not-found page, a permissive robots.txt, and the
 * build-time llms.txt / .md-mirror generator (wired as `postbuild`). Each
 * generated file is skipped, never overwritten, if the target already has
 * one. Never touches git — see astro-starlight.js's docstring for the same
 * rule.
 */
export async function applyNextjsFixes(repoPath, { platform } = {}) {
	const written = [];
	const skipped = [];
	const warnings = [];

	const appDir = ["app", "src/app"].map((d) => path.join(repoPath, d)).find(existsSync);
	if (!appDir) {
		warnings.push(`No app/ (or src/app/) directory found under ${repoPath} — Pages Router isn't supported yet, skipping not-found page.`);
	} else {
		if (hasNotFound(appDir)) skipped.push(`${appDir} (a not-found route already exists)`);
		else await writeIfAbsent(path.join(appDir, "not-found.js"), NOT_FOUND_PAGE, written, skipped);
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

	// An `app/robots.{js,ts}` metadata route would conflict with a static public/robots.txt.
	const robotsRoute = appDir && ["js", "ts"].map((ext) => path.join(appDir, `robots.${ext}`)).find(existsSync);
	if (robotsRoute) skipped.push(`${robotsRoute} (robots metadata route already exists)`);
	else await writeIfAbsent(path.join(repoPath, "public/robots.txt"), ROBOTS_TXT({ sitemapUrl }), written, skipped);

	await wireAgentReadiness(repoPath, appDir, { written, skipped, warnings, platform });

	return { written, skipped, warnings };
}

/**
 * Installs the agent-readiness generator and hooks it to `postbuild` so every
 * build rewrites `public/llms.txt` and `public/**\/*.md`. App Router only; a
 * static export (`output: "export"`) copies `public/` during the build itself,
 * so a postbuild step would be too late there.
 */
async function wireAgentReadiness(repoPath, appDir, { written, skipped, warnings, platform }) {
	if (!appDir) return; // Pages Router: already warned above
	// OpenNext (CloudFront + S3) gives every top-level entry of public/ its own CloudFront behavior, and a
	// directory becomes `<dir>/*` routed to the static bucket. Mirrors under public/academy/ would send every
	// page under /academy/ to S3 (403). That took a real site down in v1.19.0-v1.19.2, so it is never wired there.
	if (platform === "aws-cloudfront-opennext") {
		warnings.push(
			"AWS/OpenNext: llms.txt and .md mirrors were NOT set up. Files generated into public/ would be served by CloudFront from S3, and every directory in public/ becomes a `<dir>/*` behavior, so mirrors under a route prefix (public/docs/, public/ko/) would make the HTML pages under that prefix return 403. " +
				"Serve them from a route handler or a CloudFront function instead."
		);
		return;
	}
	const configPath = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"].map((f) => path.join(repoPath, f)).find(existsSync);
	if (configPath && /output\s*:\s*['"`]export['"`]/.test(await readFile(configPath, "utf8"))) {
		warnings.push("Next.js: `output: \"export\"` copies public/ during the build, before a postbuild step could add files, so llms.txt and .md mirrors were not set up.");
		return;
	}

	const scriptPath = path.join(repoPath, AGENT_SCRIPT_PATH);
	if (existsSync(scriptPath)) {
		skipped.push(`${scriptPath} (already exists)`);
	} else {
		await mkdir(path.dirname(scriptPath), { recursive: true });
		await copyFile(AGENT_SCRIPT_SOURCE, scriptPath);
		written.push(scriptPath);
	}

	const pkgPath = path.join(repoPath, "package.json");
	let raw;
	let pkg;
	try {
		raw = await readFile(pkgPath, "utf8");
		pkg = JSON.parse(raw);
	} catch {
		warnings.push(`Next.js: could not read ${pkgPath}; add \`"postbuild": "${POSTBUILD_COMMAND}"\` to its scripts by hand.`);
		return;
	}
	const hook = pkg.scripts?.postbuild;
	if (!pkg.scripts?.build) {
		warnings.push(`Next.js: package.json has no \`build\` script; run \`${POSTBUILD_COMMAND}\` after \`next build\` yourself.`);
	} else if (hook && !hook.includes("agent-readiness")) {
		skipped.push(`${pkgPath} (a postbuild script already exists; add \`${POSTBUILD_COMMAND}\` to it by hand)`);
	} else if (!hook) {
		const indent = raw.match(/^([ \t]+)"/m)?.[1] ?? "  ";
		const eol = raw.includes("\r\n") ? "\r\n" : "\n";
		pkg.scripts.postbuild = POSTBUILD_COMMAND;
		let out = JSON.stringify(pkg, null, indent);
		if (eol === "\r\n") out = out.replace(/\n/g, eol);
		await writeFile(pkgPath, out + (/\r?\n$/.test(raw) ? eol : ""), "utf8");
		written.push(pkgPath);
	}

	warnings.push(
		"Next.js agent-readiness: every build now writes public/llms.txt and public/**/*.md from the prerendered pages (only files it wrote itself are ever replaced or removed); add them to .gitignore. " +
			"It runs from the `postbuild` script, so a deploy that calls `next build` directly (not your package's `build` script) must run the script itself. " +
			"Links are root-relative unless a page declares a canonical URL (or AGENT_READINESS_ORIGIN is set). " +
			"Server-rendered routes aren't covered, and the `llms.txt` pointer in each page's HTML (afdocs `llms-txt-directive-html`) needs a layout change siteready doesn't make."
	);
}

// Any not-found route at any depth (e.g. `app/[lang]/not-found.tsx` in an i18n
// app) means the site already handles 404s; a second root-level one would
// shadow or conflict with it. Any extension, since most apps are TypeScript.
function hasNotFound(dir) {
	return readdirSync(dir, { withFileTypes: true }).some((e) =>
		e.isDirectory() ? e.name !== "node_modules" && hasNotFound(path.join(dir, e.name)) : /^not-found\.(js|jsx|ts|tsx)$/.test(e.name)
	);
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
