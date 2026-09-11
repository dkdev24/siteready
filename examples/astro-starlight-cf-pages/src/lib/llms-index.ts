import type { getCollection } from 'astro:content';

type Doc = Awaited<ReturnType<typeof getCollection<'docs'>>>[number];

export function slugFromId(id: string): string {
	const withoutExt = id.replace(/\.(md|mdx)$/, '');
	if (withoutExt === 'index') return '';
	return withoutExt.replace(/\/index$/, '');
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

// Root-relative links (not astro.config's `site`) so every llms.txt file
// keeps resolving correctly regardless of which domain/port actually serves
// it — production domain, a preview deploy, or a local dev/test server.
function entryLine(doc: Doc): string {
	const slug = slugFromId(doc.id);
	const href = slug ? `/${slug}/` : '/';
	const md = slug ? `/${slug}.md` : '/index.md';
	const description = doc.data.description ? `: ${doc.data.description}` : '';
	return `- [${doc.data.title}](${href})${description} — markdown: ${md}`;
}

/**
 * Renders `### <section>` groups of doc links. Pass `onlySection` to render
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
		if (!onlySection) lines.push(`### ${section}`, '');
		for (const doc of items) lines.push(entryLine(doc));
		lines.push('');
	}
	return lines;
}

export function txtResponse(lines: string[]): Response {
	return new Response(lines.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
