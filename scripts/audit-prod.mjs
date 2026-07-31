#!/usr/bin/env node
/**
 * Production-dependency audit with an explicit allowlist.
 *
 * Why this exists instead of a bare `npm audit --audit-level=high`:
 *
 *   1. Dev-only advisories are excluded (`--omit=dev`). A DoS in a linter's
 *      transitive glob parser does not ship to users and cannot be triggered by
 *      them. Auditing it produces a permanent red X nobody can act on.
 *   2. Some production advisories have no published fix. npm still reports
 *      "fix available" because it computes a version bump without checking
 *      whether that version exists. Those go in ALLOWLIST, each with a reason
 *      and a re-check condition, so they are decisions rather than noise.
 *
 * Anything NOT in the allowlist fails the build. Adding an entry should require
 * the same scrutiny as any other security decision.
 */

import { execFileSync } from "node:child_process";

/**
 * @type {Array<{ghsa: string, package: string, reason: string, recheck: string}>}
 */
const ALLOWLIST = [
  {
    ghsa: "GHSA-qwww-vcr4-c8h2",
    package: "react-router",
    reason:
      "RSC Mode CSRF bypass. This app is a plain Vite SPA with no React Server " +
      "Components and no RSC actions, so the vulnerable code path is not present " +
      "in the bundle. The advisory range (7.12.0 - 8.2.0) extends past 7.18.2, " +
      "the latest published release, so no patched version exists to move to.",
    recheck:
      "Remove this entry when react-router publishes a release outside the " +
      "advisory range, or if this app ever adopts RSC.",
  },
];

const allowed = new Set(ALLOWLIST.map((entry) => entry.ghsa));

function runAudit() {
  try {
    // Exits non-zero when advisories exist, so the error path carries the JSON.
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

  // `via` holds either advisory objects or names of packages that depend on a
  // vulnerable package. Only the objects carry a GHSA id.
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
  "Fix these, or — if a fix genuinely does not exist and the code path is not\n" +
    "reachable — add an entry to ALLOWLIST in scripts/audit-prod.mjs with a\n" +
    "reason and a re-check condition.",
);
process.exit(1);
