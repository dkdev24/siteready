import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Claude Code tells the agent its skill's own base directory at load time
// (a system-reminder), so the `<skill-dir>` placeholder in SKILL.md is left
// for Claude itself to resolve — no rewriting needed, just copy it verbatim.
export async function installClaudeSkill({ skillMd, global, force, uninstall }) {
  const dir = path.join(global ? os.homedir() : process.cwd(), ".claude", "skills", "siteready");
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
  await writeFile(file, skillMd, "utf8");
  return { written: [file], skipped: [], warnings: [] };
}
