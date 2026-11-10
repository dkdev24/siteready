import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Shared `_headers`-file helper for the Cloudflare Pages and Netlify platform
// fixers — both hosts read the same `_headers` format from the publish dir
// (one rule per line, headers indented under it; `#` comments). Ensures a
// `/*.md` block carrying `X-Robots-Tag: noindex` exists, so a site's `.md`
// siblings stop reading as duplicate content to search engines while agents
// keep reading them unchanged via llms.txt. Never removes or rewrites an
// existing rule — it only appends the header to an existing `/*.md` block, or
// appends the whole block when there is none.

const MD_NOINDEX_BLOCK = [
  "# .md siblings duplicate their HTML pages — keep them out of search results.",
  "# Agents keep reading them; this header only affects search indexing.",
  "/*.md",
  "  Content-Type: text/markdown; charset=utf-8",
  "  X-Robots-Tag: noindex",
].join("\n");

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

// Index of the header line `X-Robots-Tag: noindex` inside one `_headers`
// block (the lines between a rule line and the next rule line), or -1.
function noindexLineIndex(lines, blockStart, blockEnd) {
  for (let i = blockStart + 1; i < blockEnd; i++) {
    const line = lines[i];
    if (/^\s*x-robots-tag\s*:/i.test(line) && /\bnoindex\b/i.test(line)) return i;
  }
  return -1;
}

/**
 * Ensures `headersPath` has a `/*.md` block with `X-Robots-Tag: noindex`.
 * Returns `{ action: "created" | "appended" | "skipped", reason? }` — "created"
 * when the file didn't exist, "appended" when the block (or just the header
 * line) was added to an existing file, "skipped" when the rule is already
 * there. Callers map this onto the fixer's `{ written, skipped }` lists.
 */
export async function ensureMdNoindexHeader(headersPath) {
  await mkdir(path.dirname(headersPath), { recursive: true });
  let existing = null;
  try {
    existing = await readFile(headersPath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  if (existing == null) {
    await writeFile(headersPath, `${MD_NOINDEX_BLOCK}\n`, "utf8");
    return { action: "created" };
  }

  const eol = detectEol(existing);
  const lines = existing.split(/\r?\n/);
  // A rule line is a non-empty, non-comment line at column 0; its block runs
  // to the next rule line or EOF.
  const isRuleLine = (line) => line.length > 0 && !line.startsWith("#") && !/^\s/.test(line);
  let blockStart = -1;
  let blockEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isRuleLine(lines[i])) {
      if (blockStart !== -1) {
        blockEnd = i;
        break;
      }
      if (lines[i].trim() === "/*.md") blockStart = i;
    }
  }

  if (blockStart !== -1) {
    if (noindexLineIndex(lines, blockStart, blockEnd) !== -1) {
      return { action: "skipped", reason: "already sets X-Robots-Tag: noindex for /*.md" };
    }
    // Append the header line at the end of the block (after its last header
    // line, or right after the rule line when the block has none).
    let insertAt = blockStart + 1;
    for (let i = blockStart + 1; i < blockEnd; i++) {
      if (lines[i].trim() !== "") insertAt = i + 1;
    }
    lines.splice(insertAt, 0, "  X-Robots-Tag: noindex");
    await writeFile(headersPath, lines.join(eol), "utf8");
    return { action: "appended" };
  }

  const prefix = existing === "" || existing.endsWith("\n") || existing.endsWith("\r\n") ? "" : eol;
  await writeFile(headersPath, `${existing}${prefix}${MD_NOINDEX_BLOCK.split("\n").join(eol)}${eol}`, "utf8");
  return { action: "appended" };
}
