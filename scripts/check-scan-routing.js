// Regression check for local-scan URL routing and is-agentic failure handling.
// Hosted scanners need the public tunnel URL; every other scanner must use the
// local server, because the Quick Tunnel's Cloudflare edge answers AI-crawler
// user agents (what agent-headers sends) with 403. And a scan the hosted
// service couldn't finish must be an error, not a score-less "result".
import assert from "node:assert/strict";
import { HOSTED_SCANNERS, targetFor } from "../src/scan.js";
import { assertCompleted } from "../src/scanners/is-agentic.js";

const tunnel = "https://x.trycloudflare.com";
const local = "http://localhost:3000";
for (const name of HOSTED_SCANNERS) assert.equal(targetFor(name, tunnel, local), tunnel, name);
for (const name of ["afdocs", "agent-headers"]) assert.equal(targetFor(name, tunnel, local), local, name);
// no local URL (public scan, or no tunnel): everything uses the one target
for (const name of ["is-agentic", "afdocs", "agent-headers", "ora"]) assert.equal(targetFor(name, "https://site.example", undefined), "https://site.example");

assert.throws(
  () => assertCompleted({ type: "about:blank", title: "Is Agentic could not complete the scan", status: 502, detail: "The scan service did not produce a completed report.", code: "scan_failed" }),
  /could not complete the scan: The scan service did not produce a completed report\. \(scan_failed\)/
);
assert.doesNotThrow(() => assertCompleted({ score: 0, issues: [] }));
assert.doesNotThrow(() => assertCompleted({ score: 67 }));

console.log("OK: hosted scanners use the tunnel URL, others the local server; incomplete is-agentic scans are errors.");
