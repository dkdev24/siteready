import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

function slugFromId(id: string): string {
	const withoutExt = id.replace(/\.(md|mdx)$/, '');
	if (withoutExt === 'index') return '';
	return withoutExt.replace(/\/index$/, '');
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
				// Root-relative links (not astro.config's `site`) so llms.txt keeps
				// resolving correctly regardless of which domain/port actually serves
				// it (production domain, a preview deploy, or a local dev/test server).
				href: slug ? `/${slug}/` : '/',
				md: slug ? `/${slug}.md` : '/index.md',
				title: entry.data.title,
				description: entry.data.description ? `: ${entry.data.description}` : '',
			};
		});
	entries.sort((a, b) => a.parts.join('/').localeCompare(b.parts.join('/')));

	// A second-level segment is a real subsection only if some page sits below
	// it; otherwise it is a leaf page that happens to live two levels deep.
	const subsections = new Set(
		entries.filter((e) => e.parts.length > 2).map((e) => `${e.parts[0]}/${e.parts[1]}`),
	);

	// Group by top-level section, then by second-level directory, so the index
	// reads as navigation an agent can traverse rather than a flat URL dump.
	const sections = new Map<string, Map<string, typeof entries>>();
	for (const entry of entries) {
		const section = entry.parts.length > 0 ? entry.parts[0] : '';
		const group =
			entry.parts.length > 1 && subsections.has(`${entry.parts[0]}/${entry.parts[1]}`)
				? entry.parts[1]
				: '';
		const groups = sections.get(section) ?? new Map();
		groups.set(group, [...(groups.get(group) ?? []), entry]);
		sections.set(section, groups);
	}

	const topLevel = [...sections.keys()].filter(Boolean).sort();
	const line = (e: (typeof entries)[number]) =>
		`- [${e.title}](${e.href})${e.description} — markdown: ${e.md}`;

	const lines: string[] = [
		'# Documentation',
		'',
		"> Machine-readable index of this site's documentation, generated at build time.",
		'> Every page below is listed with its canonical URL; append `.md` to any of',
		'> them (or send `Accept: text/markdown`) for clean markdown.',
		'',
		'## URL structure',
		'',
		'Documentation lives under these top-level sections:',
		'',
		...topLevel.map((section) => `- \`/${section}/\``),
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
		lines.push(`### ${headingFor(section)}`, '');
		// Pages sitting directly under the section come before its subsections.
		const direct = groups.get('');
		if (direct) {
			groups.delete('');
			for (const e of direct) lines.push(line(e));
			lines.push('');
		}
		for (const group of [...groups.keys()].sort()) {
			lines.push(`#### ${headingFor(group)}`, '');
			for (const e of groups.get(group) ?? []) lines.push(line(e));
			lines.push('');
		}
	}

	return new Response(lines.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
