// Astro's markdown pipeline runs remark-smartypants by default, curling
// straight quotes/apostrophes and collapsing "..." on rendered HTML. A route
// that serves a content collection entry's raw body verbatim won't have that
// transform applied, so every quote/apostrophe reads as a content difference
// to a markdown-vs-HTML parity checker even though nothing is missing. Wrap
// your served markdown body in smartQuotes() to keep the two in sync — skips
// fenced/inline code so snippets aren't touched.
export function smartQuotes(markdown) {
	return markdown
		.split(/(```[\s\S]*?```|`[^`]*`)/)
		.map((chunk, i) =>
			i % 2 === 1
				? chunk
				: chunk
						.replace(/(^|[\s([{—-])"/g, '$1“')
						.replace(/"/g, '”')
						.replace(/(^|[\s([{—-])'/g, "$1‘")
						.replace(/'/g, '’')
						.replace(/\.\.\./g, '…')
		)
		.join('');
}
