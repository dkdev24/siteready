import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SvelteKit sites are fixed without touching their source: a zero-dependency
// script (src/templates/sveltekit-agent-readiness.mjs) is installed and wired as
// `postbuild`, and it post-processes the build output directory (canonical link,
// homepage JSON-LD, llms.txt pointer, `.md` mirrors, `/404.md`, `llms.txt`). See
// the template's header for what it covers and never touches. Only prerendered
// output (adapter-static) is covered.

const AGENT_SCRIPT_SOURCE = fileURLToPath(new URL("../templates/sveltekit-agent-readiness.mjs", import.meta.url));
const AGENT_SCRIPT_PATH = "scripts/agent-readiness.mjs";
const POSTBUILD_COMMAND = `node ${AGENT_SCRIPT_PATH}`;

const ROBOTS_TXT = "User-agent: *\nAllow: /\n";

/**
 * Applies the SvelteKit framework-side agent-readiness fixes to a local site
 * checkout: a permissive robots.txt and the build-output generator (wired as
 * `postbuild`). Each generated file is skipped, never overwritten, if the
 * target already has one. Never touches git — see astro-starlight.js's
 * docstring for the same rule.
 */
export async function applySveltekitFixes(repoPath) {
  const written = [];
  const skipped = [];
  const warnings = [];

  const robotsRoute = ["static/robots.txt", "src/routes/robots.txt"].map((f) => path.join(repoPath, f)).find(existsSync);
  if (robotsRoute) skipped.push(`${robotsRoute} (robots.txt already exists)`);
  else {
    await mkdir(path.join(repoPath, "static"), { recursive: true });
    await writeFile(path.join(repoPath, "static/robots.txt"), ROBOTS_TXT, "utf8");
    written.push(path.join(repoPath, "static/robots.txt"));
  }

  const config = await readConfig(repoPath);
  if (!/adapter-static/.test(config.source) && !/adapter-static/.test(config.pkg)) {
    warnings.push("SvelteKit: @sveltejs/adapter-static not found. The generator only post-processes prerendered output, so it will find nothing to do unless you prerender.");
  }
  const outDir = config.source.match(/pages\s*:\s*(['"`])((?:(?!\1).)*)\1/)?.[2] ?? "build";

  const scriptPath = path.join(repoPath, AGENT_SCRIPT_PATH);
  if (existsSync(scriptPath)) {
    skipped.push(`${scriptPath} (already exists)`);
  } else {
    await mkdir(path.dirname(scriptPath), { recursive: true });
    await copyFile(AGENT_SCRIPT_SOURCE, scriptPath);
    await writeFile(scriptPath, (await readFile(scriptPath, "utf8")).replace("__OUT_DIR__", outDir), "utf8");
    written.push(scriptPath);
  }

  const pkgPath = path.join(repoPath, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(config.pkg);
  } catch {
    warnings.push(`SvelteKit: could not read ${pkgPath}; add \`"postbuild": "${POSTBUILD_COMMAND}"\` to its scripts by hand.`);
    return { written, skipped, warnings };
  }
  const hook = pkg.scripts?.postbuild;
  if (!pkg.scripts?.build) {
    warnings.push(`SvelteKit: package.json has no \`build\` script; run \`${POSTBUILD_COMMAND}\` after \`vite build\` yourself.`);
  } else if (hook && !hook.includes("agent-readiness")) {
    skipped.push(`${pkgPath} (a postbuild script already exists; add \`${POSTBUILD_COMMAND}\` to it by hand)`);
  } else if (!hook) {
    const indent = config.pkg.match(/^([ \t]+)"/m)?.[1] ?? "  ";
    const eol = config.pkg.includes("\r\n") ? "\r\n" : "\n";
    pkg.scripts.postbuild = POSTBUILD_COMMAND;
    let out = JSON.stringify(pkg, null, indent);
    if (eol === "\r\n") out = out.replace(/\n/g, eol);
    await writeFile(pkgPath, out + (/\r?\n$/.test(config.pkg) ? eol : ""), "utf8");
    written.push(pkgPath);
  }

  warnings.push(
    `SvelteKit agent-readiness: every build now post-processes ${outDir}/ (only files it wrote itself are ever replaced; nothing in src/ changed). ` +
      "It runs from the `postbuild` script (pnpm 8+ and npm run it automatically), so a deploy that calls `vite build` directly must run the script itself. " +
      "Canonical links and JSON-LD need the site origin: it is read from each page's og:url, or set AGENT_READINESS_ORIGIN. JSON-LD defaults to `WebSite`; set AGENT_READINESS_SCHEMA_TYPE (e.g. SoftwareApplication) if another type fits. " +
      "Server-rendered routes aren't covered. Content decisions stay yours: an about/contact page, a 'when to use this' section in llms.txt, and absolute links in markdown you generate yourself."
  );

  return { written, skipped, warnings };
}

async function readConfig(repoPath) {
  const read = async (f) => (existsSync(path.join(repoPath, f)) ? readFile(path.join(repoPath, f), "utf8") : "");
  const source = (await Promise.all(["svelte.config.js", "svelte.config.ts", "svelte.config.mjs"].map(read))).join("\n");
  return { source, pkg: await read("package.json") };
}
