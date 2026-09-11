import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Codex CLI and OpenCode both discover skills at .agents/skills/<name>/SKILL.md
// (project) / ~/.agents/skills/<name>/SKILL.md (global) — same file, so both
// agent ids install to this one path. Neither documents Claude Code's
// "here's your own base directory" runtime signal, so the `<skill-dir>`
// placeholder is baked in as a real absolute path at install time instead of
// left for the agent to resolve.
function bakeSkillDir(skillMd, resolvedPath) {
  return skillMd
    .replace(
      /the one you were told when\s+this skill loaded — siteready's own repo, wherever it's installed/,
      "siteready's own installed location, baked in below by `siteready install-skill` at install time"
    )
    .replaceAll("<skill-dir>", resolvedPath);
}

export async function installAgentsSkill({ packageRoot, skillMd, global, force, uninstall }) {
  const dir = path.join(global ? os.homedir() : process.cwd(), ".agents", "skills", "siteready");
  const file = path.join(dir, "SKILL.md");

  if (uninstall) {
    if (!existsSync(dir)) return { written: [], skipped: [], warnings: [], removed: [] };
    await rm(dir, { recursive: true, force: true });
    return { written: [], skipped: [], warnings: [], removed: [dir] };
  }

  if (existsSync(file) && !force) {
    return { written: [], skipped: [file], warnings: [`Already installed at ${file} — pass --force to overwrite`] };
  }

  await mkdir(dir, { recursive: true });
  await writeFile(file, bakeSkillDir(skillMd, packageRoot), "utf8");
  return { written: [file], skipped: [], warnings: [] };
}
