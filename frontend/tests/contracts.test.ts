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

/**
 * The ink ramp has three grades and they are not interchangeable: `ink` is body
 * copy, `ink-muted` is *secondary copy*, and `ink-faint` is the 3:1 caption and
 * placeholder grade — index.css says so at the declaration, and
 * check-colour-contrast.mjs holds it to 3:1 rather than 4.5:1 precisely because
 * it is never prose.
 *
 * Every placeholder in the app used `ink-muted` anyway, so a hint sat at the
 * same weight as a real value: "you@example.com" in an empty email field read as
 * a filled-in address, and "123456" in an OTP field read as an entered code. It
 * is not a contrast failure — it is over-contrast, which no ratio floor can
 * catch, and `ink-faint` went unused by the entire application as a result.
 */
describe("placeholders", () => {
  it("use the faint grade, never the secondary-copy grade", () => {
    // Matches the Tailwind pseudo-variant and Radix's data attribute alike:
    // `placeholder:text-*` on inputs and textareas, `data-[placeholder]:text-*`
    // on the select trigger.
    const MUTED_PLACEHOLDER = /placeholder(\]|):text-ink-muted/;

    const offenders = FILES.filter((file) =>
      MUTED_PLACEHOLDER.test(readFileSync(file, "utf8")),
    ).map((f) => relative(SRC, f).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });

  it("are styled by the one shared field surface, not per file", () => {
    // <textarea> and <select> have no primitive of their own, so they carry a
    // class string. Two byte-identical copies of it lived in JobForm and
    // CompanyEdit — under a comment in JobForm warning that repeating it "is how
    // the two drift" — and neither styled a placeholder at all, so those fields
    // fell back to the browser's default grey in both themes. One exported
    // constant is what makes the rule stateable in a single place.
    expect(readFileSync(join(SRC, "lib/fieldSurface.ts"), "utf8")).toMatch(
      /export const FIELD_SURFACE[\s\S]{0,400}?placeholder:text-ink-faint/,
    );

    // The two consumers must read that constant, not carry their own copy. A
    // literal class string assigned to FIELD is the shape both copies had.
    const redeclared = ["components/workspace/JobForm.tsx", "components/workspace/CompanyEdit.tsx"]
      .filter((rel) => !/const FIELD = FIELD_SURFACE;/.test(readFileSync(join(SRC, rel), "utf8")));

    expect(redeclared).toEqual([]);
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
