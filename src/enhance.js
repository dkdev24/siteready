import { existsSync } from "node:fs";
import path from "node:path";
import { detectStack } from "./detect-stack.js";
import { applyAstroStarlightFixes } from "./fixers/astro-starlight.js";
import { applyAstroFixes } from "./fixers/astro.js";
import { applyNextjsFixes } from "./fixers/nextjs.js";
import { applyCloudflarePagesFixes } from "./platforms/cloudflare-pages.js";
import { applyVercelFixes } from "./platforms/vercel.js";

const FRAMEWORK_FIXERS = {
  "astro-starlight": applyAstroStarlightFixes,
  astro: applyAstroFixes,
  nextjs: applyNextjsFixes,
};

const PLATFORM_FIXERS = {
  "cloudflare-pages": applyCloudflarePagesFixes,
  vercel: applyVercelFixes,
};

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
        `Astro (with or without Starlight) + Cloudflare Pages, or Next.js + Vercel, today. ${stack.reason}`
    );
  }

  const framework = await FRAMEWORK_FIXERS[stack.framework](resolved);
  const platform = await PLATFORM_FIXERS[stack.platform](resolved);

  return {
    stack,
    written: [...framework.written, ...platform.written],
    skipped: [...framework.skipped, ...platform.skipped],
    warnings: [...framework.warnings, ...platform.warnings],
  };
}
