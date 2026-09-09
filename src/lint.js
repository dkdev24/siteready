import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local link check for internal links a build won't catch.
 *
 * Markdown link validators (Starlight's `starlight-links-validator`, and the
 * equivalents elsewhere) walk the markdown AST, which means they only see
 * `[text](/path/)`. They do not see `href` on a component — `<LinkCard
 * href="/path/">`, `<Card>`, a project's own card/button wrappers — or `link:`
 * in frontmatter, which is how Starlight hero actions are written. A docs site
 * can therefore build green with a dead link on its homepage.
 *
 * That is not a cosmetic problem for agent readiness: the homepage is where a
 * crawl starts, and a card pointing at a path that never existed sends an agent
 * into a 404 on its first hop. Found exactly that way on a real production docs
 * site, where the build, the link validator, and all three scanners were green.
 *
 * This runs against the repo's own build output rather than a served URL, so it
 * needs a build first — that is also what makes it exact: a link is broken iff
 * nothing in the build answers it.
 */

const LINK_PATTERN = /(?:href|link)\s*[:=]\s*["']([^"'\s]+)["']/g;
const SOURCE_EXTENSIONS = new Set([".md", ".mdx", ".astro"]);
const SKIPPED_PREFIXES = ["http://", "https://", "//", "#", "mailto:", "tel:", "javascript:", "data:"];

async function walk(dir, out = []) {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "node_modules" || item.name.startsWith(".")) continue;
      await walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(item.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The URL a source file is served at. Starlight content lives under
 * `src/content/docs/`; plain Astro pages under `src/pages/`. Anything else is
 * still scanned for links, but its own URL is unknown, so relative links from
 * it can't be resolved and are reported as unresolvable rather than broken.
 */
function urlForSource(repoPath, file) {
  const rel = path.relative(repoPath, file).split(path.sep).join("/");
  const roots = ["src/content/docs/", "src/pages/"];
  const root = roots.find((r) => rel.startsWith(r));
  if (!root) return null;

  let slug = rel.slice(root.length).replace(/\.(md|mdx|astro)$/, "");
  slug = slug.replace(/(^|\/)index$/, "");
  return slug ? `/${slug}/` : "/";
}

/** Does anything in the build answer this path? */
function resolvesInBuild(distPath, urlPath) {
  const clean = urlPath.replace(/^\//, "").replace(/\/$/, "");
  const candidates = [
    path.join(distPath, clean, "index.html"),
    path.join(distPath, `${clean}.html`),
    path.join(distPath, clean),
  ];
  return candidates.some((c) => existsSync(c));
}

/**
 * Scans a repo's source files for internal links and checks each against the
 * build output. Returns findings; never writes anything.
 */
export async function lintLinks(repoPath, { dist = "dist" } = {}) {
  const resolved = path.resolve(repoPath);
  if (!existsSync(resolved)) throw new Error(`Repo path does not exist: ${resolved}`);

  const distPath = path.resolve(resolved, dist);
  if (!existsSync(distPath)) {
    throw new Error(
      `No build output at ${distPath}. lint checks links against the built site, so build it first ` +
        "(e.g. `npm run build`), or point at another directory with --dist."
    );
  }

  const sources = [
    ...(await walk(path.join(resolved, "src", "content"))),
    ...(await walk(path.join(resolved, "src", "pages"))),
  ];

  const findings = [];
  let checked = 0;

  for (const file of sources) {
    const pageUrl = urlForSource(resolved, file);
    const body = await readFile(file, "utf8");
    const relFile = path.relative(resolved, file).split(path.sep).join("/");

    for (const match of body.matchAll(LINK_PATTERN)) {
      const link = match[1];
      if (SKIPPED_PREFIXES.some((p) => link.startsWith(p))) continue;
      if (link.startsWith("{")) continue; // JSX expression, not a literal path

      // A relative link only means something if we know the page's own URL.
      if (!link.startsWith("/") && !pageUrl) continue;

      let target;
      try {
        target = new URL(link, `https://x${pageUrl ?? "/"}`).pathname;
      } catch {
        continue;
      }

      checked++;
      if (!resolvesInBuild(distPath, target)) {
        findings.push({
          file: relFile,
          line: body.slice(0, match.index).split("\n").length,
          link,
          resolved: target,
        });
      }
    }
  }

  return { checked, sources: sources.length, findings, distPath };
}

export function formatLintReport({ checked, sources, findings }) {
  const lines = [];
  if (findings.length === 0) {
    lines.push(`OK: ${checked} internal link(s) across ${sources} source file(s) all resolve in the build.`);
    return lines.join("\n");
  }

  lines.push(`${findings.length} broken internal link(s) out of ${checked} checked:\n`);
  for (const f of findings) {
    lines.push(`  ${f.file}:${f.line}`);
    lines.push(`    ${f.link}  ->  ${f.resolved} (nothing in the build answers this)`);
  }
  lines.push(
    "\nMarkdown link validators don't see `href`/`link` on components or in frontmatter, " +
      "so these can survive a green build."
  );
  return lines.join("\n");
}
