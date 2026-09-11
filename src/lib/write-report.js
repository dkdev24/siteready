import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Shared by report.js/compare.js/monitor.js/diff-report.js: each writes one
// JSON file plus its rendered Markdown counterpart into an output dir.
export async function writeJsonAndMarkdown(outDir, baseName, data, renderMarkdown) {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${baseName}.json`), JSON.stringify(data, null, 2), "utf8");
  await writeFile(path.join(outDir, `${baseName}.md`), renderMarkdown(data), "utf8");
}
