#!/usr/bin/env node
/**
 * Production-dependency audit with an explicit allowlist.
 *
 * Dev-only advisories are excluded because those packages do not ship in the
 * runtime artifact. Every high or critical production advisory fails unless a
 * reviewer documents a genuinely unreachable advisory below, together with a
 * reason and the condition that requires it to be rechecked.
 */

import { execFileSync } from "node:child_process";

/**
 * Empty by design. Adding an entry is a security decision, not routine cleanup.
 *
 * @type {Array<{ghsa: string, package: string, reason: string, recheck: string}>}
 */
const ALLOWLIST = [];
const allowed = new Set(ALLOWLIST.map((entry) => entry.ghsa));

function runAudit() {
  try {
    // npm exits non-zero when advisories exist; stdout still contains the JSON.
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  } catch (error) {
    if (error.stdout) return error.stdout;
    throw error;
  }
}

const report = JSON.parse(runAudit());
const vulnerabilities = Object.values(report.vulnerabilities ?? {});

/** @type {Array<{name: string, severity: string, ghsa: string, title: string, url: string}>} */
const unexpected = [];
const suppressed = [];

for (const vuln of vulnerabilities) {
  if (vuln.severity !== "high" && vuln.severity !== "critical") continue;

  // `via` also contains package-name strings; only objects carry advisory ids.
  const advisories = (vuln.via ?? []).filter((entry) => typeof entry === "object");

  for (const advisory of advisories) {
    const ghsa = String(advisory.url ?? "").split("/").pop() ?? "";
    const record = {
      name: advisory.name ?? vuln.name,
      severity: advisory.severity ?? vuln.severity,
      ghsa,
      title: advisory.title ?? "(no title)",
      url: advisory.url ?? "",
    };
    if (allowed.has(ghsa)) suppressed.push(record);
    else unexpected.push(record);
  }
}

if (suppressed.length > 0) {
  console.log(`Allowlisted (${suppressed.length}):`);
  for (const item of suppressed) {
    const entry = ALLOWLIST.find((candidate) => candidate.ghsa === item.ghsa);
    console.log(`  - ${item.name} ${item.ghsa}: ${item.title}`);
    console.log(`    reason: ${entry?.reason}`);
  }
  console.log("");
}

if (unexpected.length === 0) {
  console.log("No unexpected high or critical advisories in production dependencies.");
  process.exit(0);
}

console.error(`Unexpected high/critical advisories (${unexpected.length}):\n`);
for (const item of unexpected) {
  console.error(`  ${item.severity.toUpperCase()}  ${item.name}  ${item.ghsa}`);
  console.error(`    ${item.title}`);
  console.error(`    ${item.url}\n`);
}
console.error(
  "Fix these, or, if a fix genuinely does not exist and the code path is not\n" +
    "reachable, add an ALLOWLIST entry in scripts/audit-prod.mjs with a reason\n" +
    "and a re-check condition.",
);
process.exit(1);
