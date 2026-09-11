import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// GitHub Pages' native (Actions-free) Jekyll build whitelists a fixed plugin
// set — no Gemfile/bundle step available — and jekyll-sitemap + jekyll-seo-tag
// are both in it: https://pages.github.com/versions/
const REQUIRED_PLUGINS = ["jekyll-sitemap", "jekyll-seo-tag"];

const NOT_FOUND_PAGE = `---
permalink: /404.html
---

# Page not found

This page doesn't exist — it may have moved or been renamed.

- [Home](/)
- [llms.txt](/llms.txt) — machine-readable index of this site, if one exists
`;

// Every theme under github.com/pages-themes/* includes this file from its own
// head.html specifically so a site can extend <head> without overriding the
// whole layout. A custom (non-pages-themes) theme may not honor it.
const HEAD_CUSTOM = `{% seo %}\n`;

const llmsTxt = ({ title, description }) => `# ${title ?? "Site"}\n\n> ${description ?? ""}\n`;

/**
 * Applies the Jekyll/GitHub Pages framework-side fixes to a local checkout:
 * declares jekyll-sitemap + jekyll-seo-tag in _config.yml (fixes the
 * `sitemap` check and, if the theme renders {% seo %}, JSON-LD/canonical/
 * og:type), a {% seo %} include for pages-themes-family themes, a real
 * 404.html with a short recovery body, a permissive robots.txt, and an
 * llms.txt stub seeded from the site's own title/description. Each generated
 * file is skipped, never overwritten, if the target already has one. Never
 * touches git — see astro-starlight.js's docstring for the same rule.
 */
export async function applyJekyllFixes(siteRoot) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const configPath = path.join(siteRoot, "_config.yml");
  const configSource = await readFile(configPath, "utf8");
  const { updated, changed } = ensurePlugins(configSource, REQUIRED_PLUGINS);
  if (changed) {
    await writeFile(configPath, updated, "utf8");
    written.push(configPath);
  } else {
    skipped.push(`${configPath} (${REQUIRED_PLUGINS.join(" + ")} already declared)`);
  }

  await writeIfAbsent(path.join(siteRoot, "_includes/head-custom.html"), HEAD_CUSTOM, written, skipped);
  warnings.push(
    "jekyll-seo-tag only emits JSON-LD/canonical/og:type if the theme's layout renders {% seo %} — " +
      "wrote _includes/head-custom.html assuming a github.com/pages-themes/* theme (they all include " +
      "it from head.html); a custom theme may need the {% seo %} tag added to its layout by hand."
  );

  await writeIfAbsent(path.join(siteRoot, "404.md"), NOT_FOUND_PAGE, written, skipped);
  await writeIfAbsent(path.join(siteRoot, "robots.txt"), "User-agent: *\nAllow: /\n", written, skipped);
  await writeIfAbsent(path.join(siteRoot, "llms.txt"), llmsTxt(parseTitleDescription(configSource)), written, skipped);
  warnings.push("llms.txt is a stub — add a 'when to use this' section by hand; that guidance is product-specific.");
  warnings.push(
    "markdown-url-support (GET /page.md) is not fixed here: the only static-only way to do it is " +
      "splitting each page into a converted-source file plus a hand-synced raw-body sibling, which " +
      "drifts out of sync the moment either one is edited without the other. Not worth that ongoing " +
      "maintenance cost for one check — treated as an accepted gap, same as content-negotiation."
  );

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

function parseTitleDescription(yaml) {
  const clean = (v) => v?.trim().replace(/^["']|["']$/g, "");
  return {
    title: clean(yaml.match(/^title:\s*(.+)$/m)?.[1]),
    description: clean(yaml.match(/^description:\s*(.+)$/m)?.[1]),
  };
}

// ponytail: regex-based YAML list editor, not a real YAML parser — handles
// the common cases (block list, flow list, no plugins: key at all) but not
// inline comments on the same line as an entry. Swap for js-yaml if a real
// _config.yml trips it.
function ensurePlugins(yaml, names) {
  const blockRe = /^plugins:[ \t]*\n((?:[ \t]*-.*\n?)*)/m;
  const flowRe = /^plugins:\s*\[([^\]]*)\]\s*$/m;

  const blockMatch = yaml.match(blockRe);
  if (blockMatch) {
    const existing = [...blockMatch[1].matchAll(/-\s*([^\s#]+)/g)].map((m) => m[1]);
    const missing = names.filter((n) => !existing.includes(n));
    if (missing.length === 0) return { updated: yaml, changed: false };
    const block = blockMatch[1].replace(/\n?$/, "\n") + missing.map((n) => `  - ${n}\n`).join("");
    return { updated: yaml.slice(0, blockMatch.index) + `plugins:\n${block}` + yaml.slice(blockMatch.index + blockMatch[0].length), changed: true };
  }

  const flowMatch = yaml.match(flowRe);
  if (flowMatch) {
    const existing = flowMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
    const missing = names.filter((n) => !existing.includes(n));
    if (missing.length === 0) return { updated: yaml, changed: false };
    return { updated: yaml.replace(flowRe, `plugins: [${[...existing, ...missing].join(", ")}]`), changed: true };
  }

  const sep = yaml.endsWith("\n") ? "" : "\n";
  return { updated: `${yaml}${sep}plugins:\n${names.map((n) => `  - ${n}\n`).join("")}`, changed: true };
}
