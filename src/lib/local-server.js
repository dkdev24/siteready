import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { killProcessTree, spawnNpxCli } from "./npx-runner.js";

/**
 * Asks the OS for a free TCP port instead of guessing one, so `loop` doesn't
 * collide with anything else already running locally.
 */
export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function runNpmScript(args, repoPath) {
  return new Promise((resolve, reject) => {
    // Windows can't exec a .cmd shim directly via spawn() without a shell
    // host (EINVAL) — same class of issue npx-runner.js works around for npx.
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd: repoPath,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`npm ${args.join(" ")} exited with code ${code}`))
    );
  });
}

export async function ensureInstalled(repoPath, { onProgress } = {}) {
  if (existsSync(path.join(repoPath, "node_modules"))) return;
  onProgress?.("Installing dependencies (npm install)...");
  await runNpmScript(["install"], repoPath);
}

export async function buildSite(repoPath, { onProgress } = {}) {
  onProgress?.("Building site (npm run build)...");
  await runNpmScript(["run", "build"], repoPath);
}

async function waitForReady(url, { timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      // Any response at all (including a 4xx/5xx from the app itself) means
      // the server is up; we're only polling for "accepting connections."
      if (res) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Local server at ${url} did not become ready within ${timeoutMs}ms (${lastErr?.message ?? "no response"})`
  );
}

/**
 * Starts a local preview server for a repo's build output and resolves once
 * it's accepting connections. Supports Cloudflare Pages only
 * (`wrangler pages dev`), matching enhance's own platform support — this is
 * what lets `loop` scan/rescan a fixer target with no live deployment.
 */
export async function startLocalServer(repoPath, { platform, distDir = "dist", port, onProgress } = {}) {
  if (platform !== "cloudflare-pages") {
    throw new Error(
      `No local server support for platform=${platform ?? "unknown"} yet (v0.4 supports cloudflare-pages only).`
    );
  }

  const resolvedPort = port ?? (await getFreePort());
  const url = `http://localhost:${resolvedPort}`;

  onProgress?.(`Starting local Cloudflare Pages preview on ${url}...`);
  const child = spawnNpxCli("wrangler", ["pages", "dev", distDir, "--port", String(resolvedPort)], {
    cwd: repoPath,
  });

  let exited = false;
  let exitError = null;
  child.on("exit", (code, signal) => {
    exited = true;
    if (code && code !== 0) exitError = new Error(`wrangler pages dev exited with code ${code} (signal ${signal})`);
  });

  try {
    await waitForReady(url);
  } catch (err) {
    await killProcessTree(child);
    throw exitError ?? err;
  }

  return {
    url,
    async stop() {
      if (!exited) await killProcessTree(child);
    },
  };
}
