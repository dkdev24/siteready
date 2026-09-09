import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LLMS_TXT_ENDPOINT = `import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\\.(md|mdx)$/, '');
	if (withoutExt === 'index') return '';
	return withoutExt.replace(/\\/index$/, '');
}

// Directory segment -> heading text. A fixer can't know the site's own product
// names, so fall back to title-casing the directory name. Replace these with
// real section titles if you want the index to read better.
function headingFor(segment: string): string {
	return segment
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');

	const entries = docs
		// The 404 page is a routing artefact, not documentation — listing it
		// would also give it a bogus top-level section of its own.
		.filter((entry) => slugFromId(entry.id) !== '404')
		.map((entry) => {
			const slug = slugFromId(entry.id);
			return {
				parts: slug ? slug.split('/') : [],
				// Root-relative links (not astro.config's \`site\`) so llms.txt keeps
				// resolving correctly regardless of which domain/port actually serves
				// it (production domain, a preview deploy, or a local dev/test server).
				href: slug ? \`/\${slug}/\` : '/',
				md: slug ? \`/\${slug}.md\` : '/index.md',
				title: entry.data.title,
				description: entry.data.description ? \`: \${entry.data.description}\` : '',
			};
		});
	entries.sort((a, b) => a.parts.join('/').localeCompare(b.parts.join('/')));

	// A second-level segment is a real subsection only if some page sits below
	// it; otherwise it is a leaf page that happens to live two levels deep.
	const subsections = new Set(
		entries.filter((e) => e.parts.length > 2).map((e) => \`\${e.parts[0]}/\${e.parts[1]}\`),
	);

	// Group by top-level section, then by second-level directory, so the index
	// reads as navigation an agent can traverse rather than a flat URL dump.
	const sections = new Map<string, Map<string, typeof entries>>();
	for (const entry of entries) {
		const section = entry.parts.length > 0 ? entry.parts[0] : '';
		const group =
			entry.parts.length > 1 && subsections.has(\`\${entry.parts[0]}/\${entry.parts[1]}\`)
				? entry.parts[1]
				: '';
		const groups = sections.get(section) ?? new Map();
		groups.set(group, [...(groups.get(group) ?? []), entry]);
		sections.set(section, groups);
	}

	const topLevel = [...sections.keys()].filter(Boolean).sort();
	const line = (e: (typeof entries)[number]) =>
		\`- [\${e.title}](\${e.href})\${e.description} — markdown: \${e.md}\`;

	const lines: string[] = [
		'# Documentation',
		'',
		"> Machine-readable index of this site's documentation, generated at build time.",
		'> Every page below is listed with its canonical URL; append \`.md\` to any of',
		'> them (or send \`Accept: text/markdown\`) for clean markdown.',
		'',
		'## URL structure',
		'',
		'Documentation lives under these top-level sections:',
		'',
		...topLevel.map((section) => \`- \\\`/\${section}/\\\`\`),
		'',
		'Paths are not interchangeable with section or product names — a shortened',
		'guess is not a valid URL. The index below is authoritative; prefer it over',
		'constructing a path by hand.',
		'',
		'## Documentation index',
		'',
	];

	// Any page sitting at the site root comes first.
	const rootGroups = sections.get('');
	if (rootGroups) {
		sections.delete('');
		for (const items of rootGroups.values()) for (const e of items) lines.push(line(e));
		lines.push('');
	}

	for (const section of topLevel) {
		const groups = sections.get(section);
		if (!groups) continue;
		lines.push(\`### \${headingFor(section)}\`, '');
		// Pages sitting directly under the section come before its subsections.
		const direct = groups.get('');
		if (direct) {
			groups.delete('');
			for (const e of direct) lines.push(line(e));
			lines.push('');
		}
		for (const group of [...groups.keys()].sort()) {
			lines.push(\`#### \${headingFor(group)}\`, '');
			for (const e of groups.get(group) ?? []) lines.push(line(e));
			lines.push('');
		}
	}

	return new Response(lines.join('\\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
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

  await writeIfAbsent(path.join(repoPath, "src/pages/llms.txt.ts"), LLMS_TXT_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/[...slug].md.ts"), MD_MIRROR_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/components/Banner.astro"), BANNER_OVERRIDE, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/components/Head.astro"), buildHeadOverride(orgInfo), written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/content/docs/404.md"), NOT_FOUND_PAGE, written, skipped);

  const configResult = await patchAstroConfig(repoPath);
  written.push(...configResult.written);
  skipped.push(...configResult.skipped);
  warnings.push(...configResult.warnings);

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
