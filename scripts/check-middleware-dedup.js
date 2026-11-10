// Regression check for applyCloudflarePagesFixes' pre-existing-middleware
// detection: it must skip writing functions/_middleware.js when the repo
// already has EITHER a .js or a .ts middleware, not just .js. (Real repro:
// enhance duplicated _middleware.js next to a pre-existing _middleware.ts on
// a real site — the check only looked for the .js path.) The fixer also
// writes public/_headers (the .md duplicate signal), so the assertions count
// the middleware write specifically rather than the whole `written` list.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyCloudflarePagesFixes } from "../src/platforms/cloudflare-pages.js";

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "siteready-middleware-dedup-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  // No existing middleware -> writes functions/_middleware.js.
  await withTempRepo(async (dir) => {
    const result = await applyCloudflarePagesFixes(dir);
    assert.ok(
      result.written.some((f) => f.endsWith(path.join("functions", "_middleware.js"))),
      "should write middleware when none exists"
    );
    assert.ok(existsSync(path.join(dir, "functions", "_middleware.js")));
    assert.ok(
      result.written.some((f) => f.endsWith(path.join("public", "_headers"))),
      "should also write the .md noindex _headers"
    );
    assert.ok(
      (await readFile(path.join(dir, "public", "_headers"), "utf8")).includes("X-Robots-Tag: noindex")
    );
  });

  // Pre-existing _middleware.js -> skip, no duplicate write.
  await withTempRepo(async (dir) => {
    await mkdir(path.join(dir, "functions"), { recursive: true });
    await writeFile(path.join(dir, "functions", "_middleware.js"), "// existing js\n");
    const result = await applyCloudflarePagesFixes(dir);
    assert.equal(result.written.length, 1, "should only write _headers when _middleware.js already exists");
    assert.ok(result.written[0].endsWith(path.join("public", "_headers")));
    assert.equal(result.skipped.length, 1);
  });

  // Pre-existing _middleware.ts -> skip, must NOT also write _middleware.js.
  await withTempRepo(async (dir) => {
    await mkdir(path.join(dir, "functions"), { recursive: true });
    await writeFile(path.join(dir, "functions", "_middleware.ts"), "// existing ts\n");
    const result = await applyCloudflarePagesFixes(dir);
    assert.equal(result.written.length, 1, "should only write _headers when _middleware.ts already exists");
    assert.ok(result.written[0].endsWith(path.join("public", "_headers")));
    assert.equal(result.skipped.length, 1);
    assert.ok(!existsSync(path.join(dir, "functions", "_middleware.js")), "must not duplicate as .js");
  });

  console.log("OK: middleware dedup check passed (.js, .ts, and none cases).");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
