import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { killProcessTree, spawnNpxCli } from "./npx-runner.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/**
 * Generic static-file server for any platform with no bespoke local-preview
 * tool (Netlify, GitLab Pages, or any future static host) — most deploy
 * targets are just "serve a static directory over HTTP" with no platform
 * runtime to emulate, so one generic server covers all of them instead of a
 * bespoke runner per platform. No CLI spawned, no npx download, no account.
 */
function startStaticFileServer(root, resolvedPort) {
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;

  const server = http.createServer(async (req, res) => {
    try {
      const reqPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      let filePath = path.join(root, reqPath);
      // Reject any request that escapes the build output directory (e.g.
      // `..` traversal) rather than serving it — this is a network-facing
      // server even though it's local.
      if (filePath !== root && !filePath.startsWith(rootWithSep)) {
        res.writeHead(403).end();
        return;
      }
      if (existsSync(filePath) && (await stat(filePath)).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      const body = await readFile(filePath);
      res.writeHead(200, { "content-type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(resolvedPort, () => resolve(server));
  });
}

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
 * it's accepting connections. Cloudflare Pages (`wrangler pages dev`) and
 * Vercel/Next.js (`next start` — this is also what runs Edge Middleware
 * locally, unlike a static export) get their own bespoke runner because
 * their platform runtime matters; every other platform (Netlify, GitLab
 * Pages, ...) falls back to a generic static-file server over `distDir`,
 * since serving a static directory needs no platform-specific tool or
 * account. This is what lets `loop`/`scan-local` exercise a fixer target
 * with no live deployment.
 */
export async function startLocalServer(repoPath, { platform, distDir = "dist", port, onProgress } = {}) {
  if (!platform) {
    throw new Error("startLocalServer requires a detected platform.");
  }

  const resolvedPort = port ?? (await getFreePort());
  const url = `http://localhost:${resolvedPort}`;

  if (platform === "cloudflare-pages" || platform === "vercel") {
    let child;
    if (platform === "cloudflare-pages") {
      onProgress?.(`Starting local Cloudflare Pages preview on ${url}...`);
      child = spawnNpxCli("wrangler", ["pages", "dev", distDir, "--port", String(resolvedPort)], {
        cwd: repoPath,
      });
    } else {
      // `next start` runs the project's own locally-installed `next` binary
      // (via `npm run start`, already present from `ensureInstalled`) rather
      // than an npx-resolved package — this is a real production server, not
      // a static file host, so Edge Middleware executes.
      onProgress?.(`Starting local Next.js preview on ${url}...`);
      child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start", "--", "-p", String(resolvedPort)], {
        cwd: repoPath,
        detached: process.platform !== "win32",
        shell: process.platform === "win32",
      });
    }

    let exited = false;
    let exitError = null;
    child.on("exit", (code, signal) => {
      exited = true;
      if (code && code !== 0) exitError = new Error(`local server exited with code ${code} (signal ${signal})`);
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

  const root = path.resolve(repoPath, distDir);
  if (!existsSync(root)) {
    throw new Error(`Build output directory not found: ${root}`);
  }
  onProgress?.(`Starting generic static file server for ${root} on ${url}...`);
  const server = await startStaticFileServer(root, resolvedPort);

  return {
    url,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
