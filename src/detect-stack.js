import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Detects framework + platform from a local repo checkout (never from a URL
 * — enhance needs the local filesystem to write fixes; scan/report/re-scan
 * don't). Every fixer/platform pair is additive; an
 * unrecognized combination degrades to `supported: false` with a reason,
 * never a thrown error deep in a fixer.
 */
export async function detectStack(repoPath) {
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
    ((framework === "astro-starlight" || framework === "astro") && platform === "cloudflare-pages") ||
    (framework === "nextjs" && platform === "vercel");
  const reason = supported
    ? null
    : `No fixer for framework=${framework ?? "unknown"} + platform=${platform ?? "unknown"} yet (supports astro-starlight/astro + cloudflare-pages, and nextjs + vercel)`;

  return { framework, platform, supported, reason };
}
