import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

/**
 * Latest commit date per tracked file under `docsDir`, keyed by path
 * relative to `docsDir` with forward slashes. `git log --name-status`
 * always reports paths relative to the repo root regardless of `cwd`, so we
 * resolve the root once and strip it back off.
 */
function gitLastmodByFile(docsDir: string): Map<string, string> {
	const dir = resolve(docsDir);
	const dates = new Map<string, string>();

	const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf-8' });
	if (root.error || root.status !== 0) return dates;
	const repoRoot = root.stdout.trim();
	const relDocsDir = relative(repoRoot, dir).replace(/\\/g, '/');
	const prefix = `${relDocsDir}/`;

	const result = spawnSync('git', ['log', '--format=t:%cI', '--name-status', '--', relDocsDir], {
		cwd: repoRoot,
		encoding: 'utf-8',
		maxBuffer: 10 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) return dates;

	let runningDate = '';
	for (const line of result.stdout.split('\n')) {
		if (line.startsWith('t:')) {
			runningDate = line.slice(2);
			continue;
		}
		const tab = line.lastIndexOf('\t');
		if (tab === -1) continue;
		const file = line.slice(tab + 1);
		if (!file.startsWith(prefix)) continue;
		const relFile = file.slice(prefix.length);
		if (!dates.has(relFile)) dates.set(relFile, runningDate);
	}
	return dates;
}

function urlPathFor(relFile: string): string | null {
	const match = relFile.match(/^(.*)\.(mdx?|md)$/);
	if (!match) return null;
	return match[1].replace(/(^|\/)index$/, '$1').replace(/\/$/, '');
}

/**
 * Map of URL pathname (e.g. `/guides/example/`) to W3C-datetime lastmod,
 * built from git history of `contentDocsDir`. Best-effort: a page using a
 * `slug` frontmatter override won't match its source file path and simply
 * gets no lastmod.
 */
export function buildLastmodMap(contentDocsDir: string): Map<string, string> {
	const byFile = gitLastmodByFile(contentDocsDir);
	const map = new Map<string, string>();
	for (const [file, date] of byFile) {
		const path = urlPathFor(file);
		if (path === null) continue;
		map.set(path === '' ? '/' : `/${path}/`, date);
	}
	return map;
}
