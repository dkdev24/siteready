import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installClaudeSkill } from "./installers/claude.js";
import { installAgentsSkill } from "./installers/agents-skill.js";

export const SUPPORTED_AGENTS = ["claude", "codex", "opencode"];

const INSTALLERS = {
  claude: installClaudeSkill,
  codex: installAgentsSkill,
  opencode: installAgentsSkill,
};

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export async function installSkill(agentNames, { global = false, force = false, uninstall = false } = {}) {
  const root = packageRoot();
  const skillMd = await readFile(path.join(root, "SKILL.md"), "utf8");
  const npxWarning =
    !uninstall && (root.startsWith(os.tmpdir()) || /[\\/]_npx[\\/]/.test(root))
      ? `Running from a temporary/npx location (${root}) — a baked-in path may break once that cache is evicted. Run \`npm install -g siteready\` first for a stable install.`
      : null;

  const results = [];
  for (const name of agentNames) {
    const install = INSTALLERS[name];
    if (!install) {
      results.push({
        agent: name,
        written: [],
        skipped: [],
        removed: [],
        warnings: [`Unknown agent: ${name}. Supported: ${SUPPORTED_AGENTS.join(", ")}`],
      });
      continue;
    }
    const result = await install({ packageRoot: root, skillMd, global, force, uninstall });
    if (npxWarning) result.warnings.push(npxWarning);
    results.push({ agent: name, removed: [], ...result });
  }
  return results;
}
