import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const WORKSPACE_FILE = "pnpm-workspace.yaml";
const AWS_OPENNEXT_DEPS = ["@opennextjs/aws", "open-next", "cdk-nextjs-standalone", "cdk-nextjs", "sst"];
const AWS_OPENNEXT_FILES = ["open-next.config.ts", "open-next.config.js", "open-next.config.mjs", "open-next.config.cjs", "sst.config.ts", "sst.config.js", "sst.config.mjs"];
// An infra package that isn't a workspace member is still found if it sits
// directly under the workspace root and looks like one (CDK or SST project).
const INFRA_MARKERS = ["cdk.json", "sst.config.ts", "sst.config.js", "sst.config.mjs"];

function readJsonSync(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function depsOf(dir) {
  const pkg = readJsonSync(path.join(dir, "package.json"));
  return { ...pkg?.dependencies, ...pkg?.devDependencies };
}

function frameworkOf(deps) {
  return deps.astro ? (deps["@astrojs/starlight"] ? "astro-starlight" : "astro") : deps.next ? "nextjs" : null;
}

// Workspace member globs: package.json `workspaces` (array or `{ packages }`)
// or pnpm-workspace.yaml `packages:`. Returns null if `dir` isn't a workspace
// root. The YAML read is a naive line scan, not a parse, like hasGitlabPagesJob.
function workspacePatterns(dir) {
  const pkg = readJsonSync(path.join(dir, "package.json"));
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) return ws;
  if (Array.isArray(ws?.packages)) return ws.packages;
  const yamlPath = path.join(dir, WORKSPACE_FILE);
  if (!existsSync(yamlPath)) return null;
  const patterns = [];
  let inPackages = false;
  for (const line of readFileSync(yamlPath, "utf8").split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) inPackages = true;
    else if (/^\S/.test(line)) inPackages = false;
    else if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"#\s]+)['"]?/);
      if (m) patterns.push(m[1]);
    }
  }
  return patterns;
}

// Expands `dir/*` (and `dir/**`) and literal entries to existing package dirs.
// Deeper globs and `!` exclusions are not interpreted — enough for the
// conventional apps/* + packages/* + infra layouts.
function expandWorkspaceDirs(root, patterns) {
  const dirs = new Set();
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    const base = pattern.replace(/\/\*\*?$/, "");
    const wild = base !== pattern;
    const abs = path.join(root, base);
    if (!wild) {
      if (existsSync(path.join(abs, "package.json"))) dirs.add(abs);
    } else if (existsSync(abs)) {
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== "node_modules" && existsSync(path.join(abs, entry.name, "package.json"))) {
          dirs.add(path.join(abs, entry.name));
        }
      }
    }
  }
  return [...dirs];
}

// Nearest workspace root at or above `start`. Stops at a `.git` boundary so a
// checkout nested in an unrelated parent project never inherits its signals.
function findWorkspaceRoot(start) {
  for (let dir = start; ; dir = path.dirname(dir)) {
    const patterns = workspacePatterns(dir);
    if (patterns) return { root: dir, patterns };
    if (existsSync(path.join(dir, ".git")) || path.dirname(dir) === dir) return null;
  }
}

function infraSiblingDirs(root, known) {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith("."))
    .map((e) => path.join(root, e.name))
    .filter((dir) => !known.includes(dir) && existsSync(path.join(dir, "package.json")) && INFRA_MARKERS.some((f) => existsSync(path.join(dir, f))));
}

// OpenNext (SST, cdk-nextjs-standalone, or OpenNext's own CDK/Terraform) is
// what puts a Next.js app behind CloudFront + Lambda/S3. The deploy tooling
// usually lives in a different package than the app, so look at the app dir,
// the workspace root, every workspace member, and infra-looking siblings.
function hasAwsOpenNextSignal(dirs) {
  return dirs.some((dir) => {
    if (AWS_OPENNEXT_FILES.some((f) => existsSync(path.join(dir, f)))) return true;
    const deps = depsOf(dir);
    return AWS_OPENNEXT_DEPS.some((name) => deps[name]);
  });
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

  // Monorepos: the given path is either a workspace root (look down for the one
  // app package) or an app/package inside one (look up for the root, which is
  // where platform and deploy-tooling signals usually live). `siteRoot` is the
  // app dir every fixer, build, and local server should use.
  let siteRoot = repoPath;
  let framework = frameworkOf({ ...pkg.dependencies, ...pkg.devDependencies });
  const workspace = findWorkspaceRoot(repoPath);
  const workspaceRoot = workspace?.root;
  const memberDirs = workspace ? expandWorkspaceDirs(workspace.root, workspace.patterns) : [];
  if (!framework && workspace && workspace.root === repoPath) {
    const candidates = memberDirs.filter((dir) => frameworkOf(depsOf(dir)));
    if (candidates.length === 1) {
      siteRoot = candidates[0];
      framework = frameworkOf(depsOf(siteRoot));
    } else if (candidates.length > 1) {
      const list = candidates.map((dir) => path.relative(repoPath, dir)).join(", ");
      return {
        framework: null,
        platform: null,
        supported: false,
        reason: `Workspace has more than one Astro/Next.js package (${list}); point siteready at the one you want to scan or fix.`,
      };
    }
  }

  // Platform signals: the app dir first, then the workspace root.
  const signalDirs = [...new Set([siteRoot, workspaceRoot].filter(Boolean))];
  const hasFile = (...names) => signalDirs.some((dir) => names.some((name) => existsSync(path.join(dir, name))));
  const awsDirs = [...signalDirs, ...memberDirs, ...(workspaceRoot ? infraSiblingDirs(workspaceRoot, memberDirs) : [])];

  let platform = null;
  if (hasFile("wrangler.toml", "wrangler.jsonc")) {
    platform = "cloudflare-pages";
  } else if (hasFile("vercel.json")) {
    platform = "vercel";
  } else if (hasFile("netlify.toml")) {
    platform = "netlify";
  } else if (signalDirs.some(hasGitlabPagesJob)) {
    platform = "gitlab-pages";
  } else if (framework === "nextjs" && hasAwsOpenNextSignal(awsDirs)) {
    platform = "aws-cloudfront-opennext";
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
    (framework === "nextjs" && ["vercel", "netlify", "aws-cloudfront-opennext"].includes(platform));
  const reason = supported
    ? null
    : `No fixer for framework=${framework ?? "unknown"} + platform=${platform ?? "unknown"} yet (supports astro-starlight/astro + cloudflare-pages/netlify/gitlab-pages, nextjs + vercel/netlify/aws-cloudfront-opennext, and jekyll + github-pages/gitlab-pages)`;

  return { framework, platform, supported, reason, siteRoot, workspaceRoot };
}
