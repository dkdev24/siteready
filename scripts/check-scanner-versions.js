#!/usr/bin/env node
// Reports whether afdocs/is-agentic's pinned CLI versions are behind npm's
// latest published release. Doesn't touch the pin itself — a bump needs
// normalize() re-verified against the new output first (see
// scanners/afdocs.js's PACKAGE_SPEC comment and AGENTS.md). ora has no
// pinned version to check — it's a live API, always the latest engine.
import { PACKAGE_NAME as AFDOCS_NAME, PINNED_VERSION as AFDOCS_PINNED } from "../src/scanners/afdocs.js";
import { PACKAGE_NAME as IS_AGENTIC_NAME, PINNED_VERSION as IS_AGENTIC_PINNED } from "../src/scanners/is-agentic.js";

const SCANNERS = [
  { pinned: AFDOCS_PINNED, name: AFDOCS_NAME, envVar: "AFDOCS_VERSION" },
  { pinned: IS_AGENTIC_PINNED, name: IS_AGENTIC_NAME, envVar: "IS_AGENTIC_VERSION" },
];

async function latestVersion(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  if (!res.ok) throw new Error(`npm registry lookup failed for ${pkg}: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.version;
}

async function main() {
  let behind = false;

  for (const { name, pinned, envVar } of SCANNERS) {
    const latest = await latestVersion(name);
    if (latest === pinned) {
      console.log(`${name}: pinned ${pinned} — up to date.`);
    } else {
      behind = true;
      console.log(`${name}: pinned ${pinned}, npm latest is ${latest}.`);
      console.log(`  Try it for one run without editing source: ${envVar}=${latest} node src/cli.js <url>`);
    }
  }

  console.log("ora: no pinned version — direct API call, always the latest engine.");

  if (behind) {
    console.log(
      "\nA pin is behind. Bump PINNED_VERSION in the scanner's file deliberately and re-verify " +
        "normalize() against the new output (npm run verify-loop, plus a manual scan) before committing."
    );
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
