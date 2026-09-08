import { execFile } from "node:child_process";

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Opt-in PR flow for `enhance --pr`. Only runs when the caller passes `--pr`
 * explicitly — a git commit + push + `gh pr create` must never happen
 * silently. Degrades to "left as an unstaged diff" (never throws) whenever a
 * precondition isn't met, so a user without `gh` configured still gets the
 * default enhance behavior instead of a crash.
 */
export async function openEnhancePr(repoPath, { framework, platform, written }) {
  if (!written.length) {
    return { opened: false, reason: "Nothing was written — no changes to open a PR for." };
  }

  let remotes;
  try {
    remotes = await run("git", ["remote"], repoPath);
  } catch {
    return { opened: false, reason: "Not a git repository (or git not on PATH) — left as an unstaged diff." };
  }
  if (!remotes) {
    return { opened: false, reason: "No git remote configured — left as an unstaged diff." };
  }

  try {
    await run("gh", ["auth", "status"], repoPath);
  } catch {
    return {
      opened: false,
      reason: "gh CLI not installed/authenticated — left as an unstaged diff. Install & `gh auth login`, then re-run with --pr.",
    };
  }

  const branch = `siteready/enhance-${Date.now()}`;
  const title = `siteready: apply ${framework}+${platform} agent-readiness fixes`;
  const body = [
    "Automated agent-readiness fixes applied by siteready's `enhance` step.",
    "",
    "Written files:",
    ...written.map((f) => `- ${f}`),
    "",
    "Never auto-merged — review the diff before merging.",
  ].join("\n");

  await run("git", ["checkout", "-b", branch], repoPath);
  await run("git", ["add", ...written], repoPath);
  await run("git", ["commit", "-m", title], repoPath);
  await run("git", ["push", "-u", "origin", branch], repoPath);
  const url = await run("gh", ["pr", "create", "--title", title, "--body", body], repoPath);

  return { opened: true, branch, url };
}
