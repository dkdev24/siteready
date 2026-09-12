import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

// GitLab Pages requires a top-level CI job literally named `pages` (its
// `public/` artifact is what actually gets published) — this is a naive
// top-level-key check, not a YAML parse, so it doesn't validate the job
// publishes `public/`, only that the repo declares intent to deploy via
// GitLab Pages. Good enough to distinguish it from an unrelated
// `.gitlab-ci.yml` that only runs tests.
function hasGitlabPagesJob(repoPath) {
  const ciPath = path.join(repoPath, ".gitlab-ci.yml");
  if (!existsSync(ciPath)) return false;
  return /^pages:\s*$/m.test(readFileSync(ciPath, "utf8"));
}

/**
 * Detects framework + platform from a local repo checkout (never from a URL
 * — enhance needs the local filesystem to write fixes; scan/report/re-scan
 * don't). Every fixer/platform pair is additive; an
 * unrecognized combination degrades to `supported: false` with a reason,
 * never a thrown error deep in a fixer.
 */
export async function detectStack(repoPath) {
  // Jekyll/GitHub or GitLab Pages sites need no package.json at all (both
  // hosts build Jekyll server-side), and a repo can mix one with an
  // unrelated root package.json (e.g. this project's own CLI) — check for it
  // first, independent of the npm-ecosystem detection below. GitHub Pages'
  // two supported source locations: repo root or /docs.
  const jekyllRoot = [repoPath, path.join(repoPath, "docs")].find((dir) => existsSync(path.join(dir, "_config.yml")));
  if (jekyllRoot) {
    const platform = hasGitlabPagesJob(repoPath) ? "gitlab-pages" : "github-pages";
    return { framework: "jekyll", platform, supported: true, reason: null, siteRoot: jekyllRoot };
  }

  const pkgPath = path.join(repoPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { framework: null, platform: null, supported: false, reason: `No package.json found at ${pkgPath}` };
  }

  let pkg;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  } catch (err) {
    return { framework: null, platform: null, supported: false, reason: `Could not parse ${pkgPath}: ${err.message}` };
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const framework = deps.astro ? (deps["@astrojs/starlight"] ? "astro-starlight" : "astro") : deps.next ? "nextjs" : null;

  let platform = null;
  if (existsSync(path.join(repoPath, "wrangler.toml")) || existsSync(path.join(repoPath, "wrangler.jsonc"))) {
    platform = "cloudflare-pages";
  } else if (existsSync(path.join(repoPath, "vercel.json"))) {
    platform = "vercel";
  } else if (existsSync(path.join(repoPath, "netlify.toml"))) {
    platform = "netlify";
  } else if (hasGitlabPagesJob(repoPath)) {
    platform = "gitlab-pages";
  } else if (framework === "nextjs") {
    // Vercel is Next.js's own zero-config default deploy target (same
    // company) — a Next.js project with no platform config file at all is
    // almost always headed there, same reasoning as the Astro/CF-Pages
    // default below.
    platform = "vercel";
  } else {
    // No platform config file present at all is itself a signal for a
    // from-scratch Astro static site: Cloudflare Pages needs no config file
    // to deploy a static `dist/`, unlike Vercel/Netlify which usually get one
    // even for the simplest projects. Treat that absence as the CF Pages
    // default rather than "unknown" — matches the fixture's own baseline.
    platform = "cloudflare-pages";
  }

  const supported =
    ((framework === "astro-starlight" || framework === "astro") &&
      ["cloudflare-pages", "netlify", "gitlab-pages"].includes(platform)) ||
    // Next.js needs Vercel/Netlify's Edge Middleware runtime — GitLab Pages
    // is purely static hosting (same reason it's not paired with Next.js
    // below), no server-side route left for `next start` to serve.
    (framework === "nextjs" && (platform === "vercel" || platform === "netlify"));
  const reason = supported
    ? null
    : `No fixer for framework=${framework ?? "unknown"} + platform=${platform ?? "unknown"} yet (supports astro-starlight/astro + cloudflare-pages/netlify/gitlab-pages, nextjs + vercel/netlify, and jekyll + github-pages/gitlab-pages)`;

  return { framework, platform, supported, reason };
}
