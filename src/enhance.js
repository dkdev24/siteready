import { existsSync } from "node:fs";
import path from "node:path";
import { detectStack } from "./detect-stack.js";
import { applyAstroStarlightFixes } from "./fixers/astro-starlight.js";
import { applyCloudflarePagesFixes } from "./platforms/cloudflare-pages.js";

/**
 * Detects the target repo's framework + platform and applies the matching
 * fixer. Never touches git — only writes files to the working tree. The
 * caller (cli.js) is responsible for telling the user to review the diff
 * themselves (or open a PR) — repo mutation is not reversible for free, so
 * this must always show-before-do.
 */
export async function enhance(repoPath) {
  const resolved = path.resolve(repoPath);
  if (!existsSync(resolved)) {
    throw new Error(`Repo path does not exist: ${resolved}`);
  }

  const stack = await detectStack(resolved);
  if (!stack.supported) {
    throw new Error(
      `enhance needs a local checkout of the target site's repo, and only supports ` +
        `Astro+Starlight+Cloudflare Pages in v0.3. ${stack.reason}`
    );
  }

  const framework = await applyAstroStarlightFixes(resolved);
  const platform = await applyCloudflarePagesFixes(resolved);

  return {
    stack,
    written: [...framework.written, ...platform.written],
    skipped: [...framework.skipped, ...platform.skipped],
    warnings: [...framework.warnings, ...platform.warnings],
  };
}
