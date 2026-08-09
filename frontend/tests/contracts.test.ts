import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract tests for rules CLAUDE.md states in prose.
 *
 * Every rule here was violated in the tree at some point despite being
 * documented, which is the argument for asserting it instead of writing it
 * down: prose does not fail a build. Each test names the failure it prevents.
 */

const SRC = join(__dirname, "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC);

describe("source tree", () => {
  it("was actually scanned", () => {
    // The first version of workspaceRoutes.test.tsx resolved its root to a
    // nonexistent directory and passed over zero files.
    expect(FILES.length).toBeGreaterThan(50);
  });
});

describe("motion", () => {
  it("is imported only through lib/motion", () => {
    // A page importing framer-motion directly bypasses the composables that
    // honour prefers-reduced-motion. Jobs.tsx did this from 4A.1 until the
    // stabilisation pass.
    const offenders = FILES.filter((file) => {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (rel.startsWith("lib/motion")) return false;
      return /from\s+["'](framer-motion|motion\/react)["']/.test(readFileSync(file, "utf8"));
    }).map((f) => relative(SRC, f).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});

describe("portal", () => {
  it("is never read from a query param outside the shared auth pages", () => {
    // Portal arrives as a route literal. The seven shared OAuth/OTP pages are
    // the documented exception, because the Google callback redirects to
    // portal-neutral paths.
    const ALLOWED = [
      "components/auth/VerifyEmail.tsx",
      "components/auth/ForgotPassword.tsx",
      "components/auth/ResetPassword.tsx",
      "components/auth/AuthComplete.tsx",
      "components/auth/LinkPending.tsx",
      "components/auth/ConfirmGoogleLink.tsx",
      "components/auth/AuthError.tsx",
      "lib/portalRoutes.ts",
      // The single validated reader those pages share. It never returns the raw
      // string, which is the property that makes reading the param safe there.
      "hooks/usePortalParam.ts",
    ];

    const offenders = FILES.filter((file) => {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (ALLOWED.includes(rel)) return false;
      const src = readFileSync(file, "utf8");
      return /get\(\s*["']portal["']\s*\)/.test(src);
    }).map((f) => relative(SRC, f).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});

describe("headings", () => {
  it("never puts more than one h1 in a page component", () => {
    // JobDescription.tsx shipped with seven <h1>s: every metadata label was a
    // top-level heading, so a screen reader's heading list was unusable.
    const violations: string[] = [];
    for (const file of FILES) {
      // Strip comments first: prose *about* <h1> is not an <h1>, and counting
      // it made this test fail on its own explanatory comment.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const count = (src.match(/<h1[\s>]/g) ?? []).length;
      if (count > 1) {
        violations.push(`${relative(SRC, file).replace(/\\/g, "/")} has ${count}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
