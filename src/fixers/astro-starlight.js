import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LLMS_TXT_ENDPOINT = `import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\\.(md|mdx)$/, '');
	if (withoutExt === 'index') return withoutExt;
	return withoutExt.replace(/\\/index$/, '');
}

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');

	// Root-relative links (not astro.config's \`site\`) so llms.txt keeps
	// resolving correctly regardless of which domain/port actually serves it
	// (production domain, a preview deploy, or a local dev/test server).
	const links = docs
		.map((entry) => {
			const slug = slugFromId(entry.id);
			const href = slug === 'index' ? '/index.md' : \`/\${slug}.md\`;
			const description = entry.data.description ? \`: \${entry.data.description}\` : '';
			return \`- [\${entry.data.title}](\${href})\${description}\`;
		})
		.join('\\n');

	const body = [
		'# Documentation',
		'',
		'> Machine-readable index of this site\\'s documentation, generated at build time.',
		'',
		'## Docs',
		'',
		links,
		'',
	].join('\\n');

	return new Response(body, {
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

  await writeIfAbsent(path.join(repoPath, "src/pages/llms.txt.ts"), LLMS_TXT_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/pages/[...slug].md.ts"), MD_MIRROR_ENDPOINT, written, skipped);
  await writeIfAbsent(path.join(repoPath, "src/components/Banner.astro"), BANNER_OVERRIDE, written, skipped);

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

  if (/Banner\s*:\s*['"`]\.\/src\/components\/Banner\.astro['"`]/.test(source)) {
    skipped.push(`${configPath} (Banner override already registered)`);
    return { written, skipped, warnings };
  }

  const starlightCallMatch = source.match(/starlight\(\s*\{/);
  if (!starlightCallMatch) {
    warnings.push(`Could not find a \`starlight({ ... })\` call in ${configPath} — register the Banner override manually.`);
    return { written, skipped, warnings };
  }

  const componentsBlockMatch = source.match(/components\s*:\s*\{/);
  if (componentsBlockMatch) {
    const insertAt = componentsBlockMatch.index + componentsBlockMatch[0].length;
    source = source.slice(0, insertAt) + `\n\t\t\t\tBanner: './src/components/Banner.astro',` + source.slice(insertAt);
  } else {
    const insertAt = starlightCallMatch.index + starlightCallMatch[0].length;
    source =
      source.slice(0, insertAt) +
      `\n\t\t\tcomponents: {\n\t\t\t\tBanner: './src/components/Banner.astro',\n\t\t\t},` +
      source.slice(insertAt);
  }

  await writeFile(configPath, source, "utf8");
  written.push(`${configPath} (registered Banner override)`);
  return { written, skipped, warnings };
}
