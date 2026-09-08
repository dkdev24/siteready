import { execFile, exec, spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_BUFFER = 50 * 1024 * 1024;

// Resolve npm's bundled npx-cli.js relative to the *currently running* node
// binary and invoke it as `node <npx-cli.js> ...args`, instead of shelling
// out to whatever "npx"/"npx.cmd" is first on PATH. Two reasons:
//   1. A PATH-resolved npx can belong to an entirely different Node/npm
//      install than the one running this script (seen in practice on
//      Windows, where cmd.exe's PATH picked up a broken npx.cmd shim).
//   2. Invoking node.exe directly with an argv array needs no shell, so
//      there's no argument-escaping/injection concern with the url argument.
//
// Node's own layout differs by platform, so try both known shapes and let
// whichever one exists on disk win:
//   - Windows installer: <root>/node.exe, <root>/node_modules/npm/bin/npx-cli.js
//     (no separate bin/ directory — the exe sits at the install root)
//   - POSIX tarball / nvm / fnm: <root>/bin/node, <root>/lib/node_modules/npm/bin/npx-cli.js
//     (node lives one level down in bin/, npm's lib/ is a sibling of bin/)
// process.execPath is realpath'd first so Homebrew-style symlinks
// (/usr/local/bin/node -> .../Cellar/node/<version>/bin/node) resolve to the
// actual install directory that node_modules/npm lives under.
function resolveNpxCli() {
  let execPath;
  try {
    execPath = realpathSync(process.execPath);
  } catch {
    execPath = process.execPath;
  }

  const binDir = path.dirname(execPath);
  const installRoot = path.dirname(binDir); // one level up from bin/, POSIX-style

  const candidates = [
    path.join(binDir, "node_modules", "npm", "bin", "npx-cli.js"), // Windows-style
    path.join(installRoot, "lib", "node_modules", "npm", "bin", "npx-cli.js"), // POSIX tarball/nvm-style
    path.join(binDir, "lib", "node_modules", "npm", "bin", "npx-cli.js"), // defensive extra
  ];

  return candidates.find((c) => existsSync(c)) ?? null;
}

function quoteForShell(value) {
  const str = String(value);
  if (process.platform === "win32") {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

/**
 * Runs `npx --yes <packageSpec> ...args` and returns raw stdout.
 * Prefers direct node-invocation of npm's npx-cli.js (no shell, no PATH
 * ambiguity); falls back to a PATH-based npx (with manual shell-arg
 * quoting) only if no known npm layout is found next to this Node binary —
 * e.g. an exotic install this hasn't been taught about yet.
 */
export async function runNpxCli(packageSpec, args, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const npxCli = resolveNpxCli();

  return new Promise((resolve, reject) => {
    const onDone = (error, stdout, stderr) => {
      // Linter-style CLIs (afdocs, is-agentic) exit non-zero when a scanned
      // site *fails* checks — that's the expected, common case for a "before"
      // baseline, not a tool failure. Only treat this as an error if there's
      // no stdout to parse; let a genuinely broken/empty response surface as
      // a JSON-parse error in the caller instead of masking it here.
      if (error && !stdout) {
        reject(
          new Error(`npx ${packageSpec} failed (${error.message}).${stderr ? `\n${stderr}` : ""}`)
        );
        return;
      }
      resolve(stdout);
    };

    if (npxCli) {
      execFile(
        process.execPath,
        [npxCli, "--yes", packageSpec, ...args],
        { timeout, maxBuffer: MAX_BUFFER },
        onDone
      );
      return;
    }

    console.warn(
      `[npx-runner] Could not find npm's npx-cli.js next to ${process.execPath}; ` +
        "falling back to PATH-resolved npx. If this fails, report the Node install layout."
    );
    const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
    const command = [npxBin, "--yes", packageSpec, ...args].map(quoteForShell).join(" ");
    exec(command, { timeout, maxBuffer: MAX_BUFFER }, onDone);
  });
}

/**
 * Spawns `npx --yes <packageSpec> ...args` as a long-running background
 * process (e.g. `wrangler pages dev`) instead of waiting for it to exit.
 * Reuses the same npx-cli.js resolution as `runNpxCli` so a local dev-server
 * launch is subject to the same PATH-ambiguity fix as a one-shot scanner
 * invocation. Caller is
 * responsible for killing the returned process (see `lib/local-server.js`'s
 * platform-aware teardown — a plain `.kill()` doesn't reap npx's own child on
 * Windows).
 */
export function spawnNpxCli(packageSpec, args, { cwd } = {}) {
  const npxCli = resolveNpxCli();
  // Detached on POSIX so the caller can kill the whole process group (npx
  // itself spawns a child for the actual CLI) via `process.kill(-pid)`
  // instead of leaving orphans behind — see `lib/local-server.js`.
  const spawnOpts = { cwd, detached: process.platform !== "win32" };

  if (npxCli) {
    return spawn(process.execPath, [npxCli, "--yes", packageSpec, ...args], spawnOpts);
  }

  console.warn(
    `[npx-runner] Could not find npm's npx-cli.js next to ${process.execPath}; ` +
      "falling back to PATH-resolved npx. If this fails, report the Node install layout."
  );
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawn(npxBin, ["--yes", packageSpec, ...args], { ...spawnOpts, shell: process.platform === "win32" });
}
