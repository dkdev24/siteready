import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Shared builder behind the whole llms.txt family: a nav index (this file's
// own GET), a full inline listing (llms-full.txt), and one scoped index per
// top-level content directory ([section]/llms.txt) — split out because a
// single flat llms.txt grows past the ~30KB llms.txt convention on any site
// with more than a couple dozen pages.
const LLMS_INDEX_LIB = `import type { getCollection } from 'astro:content';

type Doc = Awaited<ReturnType<typeof getCollection<'docs'>>>[number];

export function slugFromId(id: string): string {
	const withoutExt = id.replace(/\\.(md|mdx)$/, '');
	if (withoutExt === 'index') return '';
	return withoutExt.replace(/\\/index$/, '');
}

// First path segment of a doc's slug, e.g. 'guides' for 'guides/example' —
// the grouping unit for the scoped /<section>/llms.txt files. A root-level
// page with no section is grouped under 'general'.
export function sectionOf(slug: string): string {
	return slug.split('/')[0] || 'general';
}

export function sortedDocs(docs: Doc[]): Doc[] {
	return [...docs].sort((a, b) => slugFromId(a.id).localeCompare(slugFromId(b.id)));
}

export function sectionsOf(docs: Doc[]): string[] {
	return [...new Set(docs.map((doc) => sectionOf(slugFromId(doc.id))))].sort();
}

// Root-relative links (not astro.config's \`site\`) so every llms.txt file
// keeps resolving correctly regardless of which domain/port actually serves
// it — production domain, a preview deploy, or a local dev/test server.
function entryLine(doc: Doc): string {
	const slug = slugFromId(doc.id);
	const href = slug ? \`/\${slug}/\` : '/';
	const md = slug ? \`/\${slug}.md\` : '/index.md';
	const description = doc.data.description ? \`: \${doc.data.description}\` : '';
	return \`- [\${doc.data.title}](\${href})\${description} — markdown: \${md}\`;
}

/**
 * Renders \`### <section>\` groups of doc links. Pass \`onlySection\` to render
 * just that section's pages with no heading — the per-section files already
 * title the page themselves.
 */
export function buildSectionBody(docs: Doc[], onlySection?: string): string[] {
	const bySection = new Map<string, Doc[]>();
	for (const doc of sortedDocs(docs)) {
		const section = sectionOf(slugFromId(doc.id));
		if (onlySection && section !== onlySection) continue;
		const bucket = bySection.get(section);
		if (bucket) bucket.push(doc);
		else bySection.set(section, [doc]);
	}

	const lines: string[] = [];
	for (const [section, items] of bySection) {
		if (!onlySection) lines.push(\`### \${section}\`, '');
		for (const doc of items) lines.push(entryLine(doc));
		lines.push('');
	}
	return lines;
}

export function txtResponse(lines: string[]): Response {
	return new Response(lines.join('\\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
`;

const NAV_INDEX_ENDPOINT = `import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildSectionBody, sectionsOf, txtResponse } from '../lib/llms-index';

// llms.txt convention wants every page listed, but also wants the file to
// stay small — the two only conflict once a site has enough pages that a
// flat listing would blow past a reasonable size. Below the threshold this
// lists every page directly (full coverage, small site); past it, listing
// every page inline would make the index itself unusably large, so it
// switches to a short navigation index pointing at /llms-full.txt and one
// /<section>/llms.txt per top-level content directory instead.
const SIZE_THRESHOLD = 20_000;

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');
	const fullBody = buildSectionBody(docs).join('\\n');

	if (fullBody.length <= SIZE_THRESHOLD) {
		return txtResponse([
			'# Documentation',
			'',
			'> Machine-readable index of this site\\'s documentation, generated at build time.',
			'',
			fullBody,
		]);
	}

	const sections = sectionsOf(docs);
	return txtResponse([
		'# Documentation',
		'',
		'> Machine-readable index of this site\\'s documentation, generated at build time.',
		'> This is a navigation index — see the scoped indexes below, or the full listing, for individual pages.',
		'',
		'## Scoped indexes',
		'',
		...sections.map((section) => \`- [\${section}](/\${section}/llms.txt)\`),
		'- [Full index](/llms-full.txt) — every page in one file.',
		'',
	]);
};
`;

const LLMS_FULL_ENDPOINT = `import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildSectionBody, txtResponse } from '../lib/llms-index';

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');

	const lines = [
		'# Documentation — full index',
		'',
		'> Every documentation page in one file. See /llms.txt for a shorter navigation index.',
		'',
		...buildSectionBody(docs),
	];

	return txtResponse(lines);
};
`;

const SECTION_LLMS_ENDPOINT = `import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { buildSectionBody, sectionsOf, txtResponse } from '../../lib/llms-index';

export const getStaticPaths: GetStaticPaths = async () => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');
	return sectionsOf(docs).map((section) => ({ params: { section } }));
};

export const GET: APIRoute = async ({ params }) => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');

	const lines = [
		\`# \${params.section} documentation\`,
		'',
		'> See /llms.txt for the full site index.',
		'',
		...buildSectionBody(docs, params.section as string),
	];

	return txtResponse(lines);
};
`;

// Starlight sites commonly have no robots.txt at all (neither a static
// public/robots.txt nor a src/pages/robots.txt.ts) — this is the minimal one,
// plus the \`schemamap:\` directive the NLWeb schema feed below relies on.
const ROBOTS_TXT_ENDPOINT = `import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	const sitemapUrl = new URL('sitemap-index.xml', site);
	const schemaMapUrl = new URL('schema-map.xml', site);
	const body = \`User-agent: *
Allow: /

Sitemap: \${sitemapUrl.href}
schemamap: \${schemaMapUrl.href}
\`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
`;

// NLWeb Schema Map + Schema Feed: a machine-readable map of structured-data
// feeds (schema-map.xml) pointing at one JSON-Lines feed of per-page
// schema.org entries (schema-feed.jsonl), per the NLWeb Schema Feeds spec —
// github.com/nlweb-ai/website/blob/main/SCHEMA_SPEC.md. Referenced by the
// \`schemamap:\` directive in robots.txt.
const SCHEMA_MAP_ENDPOINT = `import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	const feedUrl = new URL('/schema-feed.jsonl', site).href;
	const body = \`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:sf="http://schema.org/schemas/schemafeed/0.1">
  <url>
    <loc>\${feedUrl}</loc>
    <sf:contentType>structuredData/schema.org</sf:contentType>
  </url>
</urlset>
\`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
`;

const SCHEMA_FEED_ENDPOINT = `import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLastmodMap } from '../lib/lastmod';
import { slugFromId } from '../lib/llms-index';

// One schema.org TechArticle per doc page, JSON Lines. \`dateModified\` is
// best-effort (from git history via buildLastmodMap) and omitted when unknown.
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs', ({ id }) => id !== '404');
	const lastmodByPath = buildLastmodMap('./src/content/docs');

	const lines = [...docs]
		.sort((a, b) => slugFromId(a.id).localeCompare(slugFromId(b.id)))
		.map((doc) => {
			const slug = slugFromId(doc.id);
			const url = new URL(slug ? \`/\${slug}/\` : '/', site).href;
			const dateModified = lastmodByPath.get(slug ? \`/\${slug}/\` : '/');
			const entry: Record<string, unknown> = {
				'@context': 'https://schema.org',
				'@type': 'TechArticle',
				'@id': url,
				url,
				name: doc.data.title,
			};
			if (doc.data.description) entry.description = doc.data.description;
			if (dateModified) entry.dateModified = dateModified;
			return JSON.stringify(entry);
		});

	return new Response(lines.join('\\n') + '\\n', {
		headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
	});
};
`;

// Latest-commit date per content file, keyed by URL path, computed from one
// \`git log --name-status\` walk (not a per-file spawn) — wired into
// astro.config.mjs's sitemap() serialize() by patchSitemapLastmod, and used
// directly by SCHEMA_FEED_ENDPOINT above for dateModified.
const LASTMOD_LIB = `import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

/**
 * Latest commit date per tracked file under \`docsDir\`, keyed by path
 * relative to \`docsDir\` with forward slashes. \`git log --name-status\`
 * always reports paths relative to the repo root regardless of \`cwd\`, so we
 * resolve the root once and strip it back off.
 */
function gitLastmodByFile(docsDir: string): Map<string, string> {
	const dir = resolve(docsDir);
	const dates = new Map<string, string>();

	const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf-8' });
	if (root.error || root.status !== 0) return dates;
	const repoRoot = root.stdout.trim();
	const relDocsDir = relative(repoRoot, dir).replace(/\\\\/g, '/');
	const prefix = \`\${relDocsDir}/\`;

	const result = spawnSync('git', ['log', '--format=t:%cI', '--name-status', '--', relDocsDir], {
		cwd: repoRoot,
		encoding: 'utf-8',
		maxBuffer: 10 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) return dates;

	let runningDate = '';
	for (const line of result.stdout.split('\\n')) {
		if (line.startsWith('t:')) {
			runningDate = line.slice(2);
			continue;
		}
		const tab = line.lastIndexOf('\\t');
		if (tab === -1) continue;
		const file = line.slice(tab + 1);
		if (!file.startsWith(prefix)) continue;
		const relFile = file.slice(prefix.length);
		if (!dates.has(relFile)) dates.set(relFile, runningDate);
	}
	return dates;
}

function urlPathFor(relFile: string): string | null {
	const match = relFile.match(/^(.*)\\.(mdx?|md)$/);
	if (!match) return null;
	return match[1].replace(/(^|\\/)index$/, '$1').replace(/\\/$/, '');
}

/**
 * Map of URL pathname (e.g. \`/guides/example/\`) to W3C-datetime lastmod,
 * built from git history of \`contentDocsDir\`. Best-effort: a page using a
 * \`slug\` frontmatter override won't match its source file path and simply
 * gets no lastmod.
 */
export function buildLastmodMap(contentDocsDir: string): Map<string, string> {
	const byFile = gitLastmodByFile(contentDocsDir);
	const map = new Map<string, string>();
	for (const [file, date] of byFile) {
		const path = urlPathFor(file);
		if (path === null) continue;
		map.set(path === '' ? '/' : \`/\${path}/\`, date);
	}
	return map;
}
`;

const MD_MIRROR_ENDPOINT = `import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\\.(md|mdx)$/, '');
	if (withoutExt === 'index') return withoutExt;
	return withoutExt.replace(/\\/index$/, '');
}

export const getStaticPaths: GetStaticPaths = async () => {
	const docs = await getCollection('docs');
	return docs.map((entry) => ({
		params: { slug: slugFromId(entry.id) },
		props: { entry },
	}));
};

export const GET: APIRoute = ({ props }) => {
	const { entry } = props as { entry: Awaited<ReturnType<typeof getCollection>>[number] };
	const frontmatter = [
		'---',
		\`title: \${JSON.stringify(entry.data.title)}\`,
		entry.data.description ? \`description: \${JSON.stringify(entry.data.description)}\` : null,
		'---',
	]
		.filter(Boolean)
		.join('\\n');

	const directive = \`> For the complete documentation index, see [llms.txt](/llms.txt).\\n\\n\`;

	return new Response(\`\${frontmatter}\\n\\n\${directive}\${entry.body ?? ''}\`, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
};
`;

const BANNER_OVERRIDE = `---
import Default from '@astrojs/starlight/components/Banner.astro';
---

<span
	style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;"
>
	<a href="/llms.txt">This documentation is also available as machine-readable markdown — see llms.txt</a>
</span>
<Default><slot /></Default>
`;

// `is-agentic`'s `metadata-completeness` and `json-ld`/`org-schema-completeness`
// checks want an og:image tag site-wide and an Organization schema on the
// homepage. The org's name/url/social links aren't guessable — they're read
// out of the site's own `starlight({ title, social })` config by
// `extractOrgInfo` and baked in as literals below. If that extraction comes
// up empty (non-standard config layout), we still emit the og:image tag but
// skip the JSON-LD block rather than publish a schema with invented data.
function buildHeadOverride({ name, url, sameAs }) {
  const hasOrgInfo = Boolean(name && url);

  const orgSetup = hasOrgInfo
    ? `
const homeEntry = isHomepage ? await getEntry('docs', 'index') : null;

const organizationSchema = {
	'@context': 'https://schema.org',
	'@type': 'Organization',
	name: ${JSON.stringify(name)},
	url: ${JSON.stringify(url)},
	logo: ogImage,
	sameAs: ${JSON.stringify(sameAs ?? [])},
	...(homeEntry?.data.description ? { description: homeEntry.data.description } : {}),
};`
    : "";

  const jsonLdMarkup = hasOrgInfo
    ? `
{isHomepage && (
	<script type="application/ld+json" set:html={JSON.stringify(organizationSchema)} />
)}`
    : "";

  return `---
import Default from '@astrojs/starlight/components/Head.astro';
import type { Props } from '@astrojs/starlight/props';
import { getEntry } from 'astro:content';

// \`starlightRoute.id\` is the docs collection slug — '' for the
// default-locale homepage. Route data lives on \`Astro.locals\`, not
// \`Astro.props\`, on current Starlight versions.
const isHomepage = Astro.locals.starlightRoute?.id === '';
const ogImage = new URL('/favicon.svg', Astro.site).href;
${orgSetup}
---
<Default {...Astro.props} />
<meta property="og:image" content={ogImage} />${jsonLdMarkup}
`;
}

// Starlight's own 404-page convention: a \`404.md\`/\`.mdx\` in the docs
// collection replaces the framework's generic not-found page. Kept
// deliberately generic (no product-specific section links) since a fixer
// can't know the site's own navigation structure.
const NOT_FOUND_PAGE = `---
title: Page Not Found
description: The page you requested doesn't exist.
template: splash
editUrl: false
---

This page doesn't exist — it may have moved or been renamed.

- Start from the [homepage](/)
- Check [\`/llms.txt\`](/llms.txt) for a machine-readable index of this site
`;

// Pulls the org's name/url/social links out of the site's own
// \`starlight({ title, social })\` config via regex — same string-patching
// approach \`patchAstroConfig\` already uses below, not a full AST parse.
// ponytail: regex extraction, breaks on unusual config formatting — swap for
// an AST-based parse (e.g. recast) if that ever bites.
function extractOrgInfo(source) {
  const titleMatch = source.match(/title:\s*(['"\`])((?:(?!\1).)*)\1/);
  const siteMatch = source.match(/site:\s*(['"\`])((?:(?!\1).)*)\1/);
  const socialBlockMatch = source.match(/social:\s*\[([\s\S]*?)\]/);
  const sameAs = socialBlockMatch
    ? Array.from(socialBlockMatch[1].matchAll(/href:\s*(['"\`])((?:(?!\1).)*)\1/g)).map((m) => m[2])
    : [];

  return {
    name: titleMatch?.[2],
    url: siteMatch?.[2],
    sameAs,
  };
}

/**
 * Applies the Astro+Starlight framework-side agent-readiness fixes to a
 * local repo checkout: llms.txt generation, .md mirror routes, and a
 * body-level llms.txt directive (Starlight's Banner override). Each fix is
 * skipped — not overwritten — if its target file already exists, so a
 * previously-customized site doesn't get clobbered by a second enhance run.
 *
 * Never writes to git (no add/commit/push) — repo mutation must always be
 * shown before it's done. Caller is responsible for surfacing the resulting diff.
 */
export async function applyAstroStarlightFixes(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const configPath = ["astro.config.mjs", "astro.config.ts", "astro.config.js"]
    .map((f) => path.join(repoPath, f))
    .find((f) => existsSync(f));
  const configSource = configPath ? await readFile(configPath, "utf8") : "";
  const orgInfo = extractOrgInfo(configSource);
  if (configPath && !(orgInfo.name && orgInfo.url)) {
    warnings.push(
      `Could not read both \`title\` and \`site\` out of ${configPath} — Head.astro was written without an ` +
        "Organization JSON-LD block. Add name/url manually if you want full org-schema credit."
    );
  }

  await writeIfAbsent(path.join(repoPath, "src/lib/llms-index.ts"), LLMS_INDEX_LIB, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/lib/lastmod.ts"), LASTMOD_LIB, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/llms.txt.ts"), NAV_INDEX_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/llms-full.txt.ts"), LLMS_FULL_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/[section]/llms.txt.ts"), SECTION_LLMS_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/[...slug].md.ts"), MD_MIRROR_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/components/Banner.astro"), BANNER_OVERRIDE, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/components/Head.astro"), buildHeadOverride(orgInfo), written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/content/docs/404.md"), NOT_FOUND_PAGE, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/schema-map.xml.ts"), SCHEMA_MAP_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/schema-feed.jsonl.ts"), SCHEMA_FEED_ENDPOINT, written, skipped);

  const robotsTsPath = path.join(repoPath, "src/pages/robots.txt.ts");
  const robotsPublicPath = path.join(repoPath, "public/robots.txt");
  if (existsSync(robotsTsPath) || existsSync(robotsPublicPath)) {
    const existing = existsSync(robotsTsPath) ? robotsTsPath : robotsPublicPath;
    skipped.push(`${existing} (already exists — add a \`schemamap:\` directive pointing at /schema-map.xml manually)`);
  } else {
    await writeIfAbsent(robotsTsPath, ROBOTS_TXT_ENDPOINT, written, skipped);
  }

  const configResult = await patchAstroConfig(repoPath);
  written.push(...configResult.written);
  skipped.push(...configResult.skipped);
  warnings.push(...configResult.warnings);

  const lastmodResult = await patchSitemapLastmod(repoPath);
  written.push(...lastmodResult.written);
  skipped.push(...lastmodResult.skipped);
  warnings.push(...lastmodResult.warnings);

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

async function patchAstroConfig(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const configPath = ["astro.config.mjs", "astro.config.ts", "astro.config.js"]
    .map((f) => path.join(repoPath, f))
    .find((f) => existsSync(f));

  if (!configPath) {
    warnings.push("No astro.config.{mjs,ts,js} found — could not register the Banner override. Add it manually.");
    return { written, skipped, warnings };
  }

  let source = await readFile(configPath, "utf8");

  if (!/site\s*:/.test(source)) {
    warnings.push(
      `${configPath} has no \`site\` option set — required for the sitemap integration and for absolute URLs. ` +
        "Not auto-filled (this fixer doesn't guess your production domain) — add it manually."
    );
  }

  const componentOverrides = [
    { key: "Banner", value: "./src/components/Banner.astro" },
    { key: "Head", value: "./src/components/Head.astro" },
  ];
  const toRegister = componentOverrides.filter(
    ({ key, value }) => !new RegExp(`${key}\\s*:\\s*['"\`]${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"\`]`).test(source)
  );

  if (toRegister.length === 0) {
    skipped.push(`${configPath} (Banner/Head overrides already registered)`);
    return { written, skipped, warnings };
  }

  const starlightCallMatch = source.match(/starlight\(\s*\{/);
  if (!starlightCallMatch) {
    warnings.push(`Could not find a \`starlight({ ... })\` call in ${configPath} — register the overrides manually.`);
    return { written, skipped, warnings };
  }

  const entries = toRegister.map(({ key, value }) => `\n\t\t\t\t${key}: '${value}',`).join("");
  const componentsBlockMatch = source.match(/components\s*:\s*\{/);
  if (componentsBlockMatch) {
    const insertAt = componentsBlockMatch.index + componentsBlockMatch[0].length;
    source = source.slice(0, insertAt) + entries + source.slice(insertAt);
  } else {
    const insertAt = starlightCallMatch.index + starlightCallMatch[0].length;
    source = source.slice(0, insertAt) + `\n\t\t\tcomponents: {${entries}\n\t\t\t},` + source.slice(insertAt);
  }

  await writeFile(configPath, source, "utf8");
  written.push(`${configPath} (registered ${toRegister.map((c) => c.key).join(", ")} override${toRegister.length > 1 ? "s" : ""})`);
  return { written, skipped, warnings };
}

/**
 * Wires src/lib/lastmod.ts's buildLastmodMap into an existing bare `sitemap()`
 * call's `serialize()` so sitemap-index.xml entries carry a real `<lastmod>`.
 * Only patches a bare `sitemap()` — a site that already passes it options
 * (e.g. a custom serialize) is left alone rather than risk clobbering it, and
 * a site with no `@astrojs/sitemap` integration at all gets a warning instead
 * of this fixer guessing at adding a new dependency.
 */
async function patchSitemapLastmod(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const configPath = ["astro.config.mjs", "astro.config.ts", "astro.config.js"]
    .map((f) => path.join(repoPath, f))
    .find((f) => existsSync(f));

  if (!configPath) {
    return { written, skipped, warnings };
  }

  const source = await readFile(configPath, "utf8");

  if (!/@astrojs\/sitemap/.test(source)) {
    warnings.push(
      `${configPath} doesn't use the @astrojs/sitemap integration — skipped wiring git-history \`lastmod\` into ` +
        "the sitemap. Add `sitemap()` from @astrojs/sitemap first, then re-run enhance."
    );
    return { written, skipped, warnings };
  }

  if (/buildLastmodMap/.test(source)) {
    skipped.push(`${configPath} (sitemap lastmod already wired in)`);
    return { written, skipped, warnings };
  }

  const bareSitemapCall = source.match(/\bsitemap\(\s*\)/);
  if (!bareSitemapCall) {
    warnings.push(
      `${configPath} calls sitemap() with existing options — not auto-patched to avoid clobbering a custom ` +
        "serialize(). Wire buildLastmodMap from src/lib/lastmod.ts into it manually."
    );
    return { written, skipped, warnings };
  }

  const importMatches = [...source.matchAll(/^import .*;$/gm)];
  const lastImport = importMatches[importMatches.length - 1];
  const importLine = "import { buildLastmodMap } from './src/lib/lastmod.ts';\n";
  let patched = lastImport
    ? source.slice(0, lastImport.index + lastImport[0].length) +
      "\n" +
      importLine +
      source.slice(lastImport.index + lastImport[0].length)
    : importLine + source;

  patched = patched.replace(
    /(\n)(export default defineConfig)/,
    `$1\nconst lastmodByPath = buildLastmodMap('./src/content/docs');\n$2`
  );

  patched = patched.replace(
    bareSitemapCall[0],
    `sitemap({\n\t\tserialize(item) {\n\t\t\tconst lastmod = lastmodByPath.get(new URL(item.url).pathname);\n\t\t\treturn lastmod ? { ...item, lastmod } : item;\n\t\t},\n\t})`
  );

  await writeFile(configPath, patched, "utf8");
  written.push(`${configPath} (wired git-history lastmod into sitemap())`);
  return { written, skipped, warnings };
}
