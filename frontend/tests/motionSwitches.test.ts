import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The motion switches must actually switch.
 *
 * From 4A.1 until this test, `:root` set `--motion-parallax: 0` and
 * `--motion-ambient: 0` — those are the *enabled* values — while the
 * `prefers-reduced-motion` block set the same two to `0`. On and off were
 * byte-identical, so no CSS-driven ambient or parallax could ever run and the
 * reduced-motion collapse was a no-op in both directions.
 *
 * Nothing caught it. `motionTiers.test.tsx` asserted the *indirection* only, and
 * that indirection was itself broken in a second way: PageShell declared
 * `--motion-parallax: var(--motion-parallax)`, a self-reference, which is a CSS
 * cycle that resolves to the empty string rather than to the :root value. Two
 * independent defects stacked, and a specified-value assertion could see
 * neither. `motionAllows` reads the data attribute instead of the variable, so
 * the JS path worked and only CSS consumers were dead. That is the likely
 * reason `useParallax` and `useMotionBudget` shipped with zero consumers:
 * wiring them up produced no visible effect, which reads as your own bug.
 *
 * So this asserts the one property no other test covers — that the enabled
 * value and the reduced value DIFFER. Asserting either number alone would pass
 * against the broken CSS.
 *
 * It reads index.css as text because jsdom does not process Tailwind 4's
 * `@theme`/nesting, so the cascade this describes cannot be observed through
 * `getComputedStyle` in this environment.
 */

const CSS = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");

/** The `:root` block that is NOT inside a media query. */
function baseRootBlock(): string {
  // Strip every at-rule block first, so a `:root` nested in one cannot match.
  const withoutAtRules = CSS.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  const match = withoutAtRules.match(/:root\s*\{([^}]*)\}/);
  expect(match, "no bare :root block found in index.css").not.toBeNull();
  return match![1];
}

/** The `:root` block inside the reduced-motion media query. */
function reducedRootBlock(): string {
  const match = CSS.match(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{([^}]*)\}/,
  );
  expect(match, "no prefers-reduced-motion :root block found").not.toBeNull();
  return match![1];
}

function valueOf(block: string, prop: string): string {
  const match = block.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  expect(match, `${prop} not declared in the block`).not.toBeNull();
  return match![1].trim();
}

describe("motion switches", () => {
  // Read once — a typo in the regex would otherwise pass vacuously against an
  // empty string, which is the failure mode workspaceRoutes.test.tsx hit.
  it("reads a real index.css", () => {
    expect(CSS.length).toBeGreaterThan(1000);
    expect(CSS).toContain("--motion-distance");
  });

  it.each(["--motion-parallax", "--motion-ambient", "--motion-distance"])(
    "%s differs between the enabled and reduced states",
    (prop) => {
      const enabled = valueOf(baseRootBlock(), prop);
      const reduced = valueOf(reducedRootBlock(), prop);

      // The whole point. Equal values mean the switch does not switch.
      expect(enabled).not.toBe(reduced);
    },
  );

  it.each(["--motion-parallax", "--motion-ambient"])("%s is off under reduced motion", (prop) => {
    expect(valueOf(reducedRootBlock(), prop)).toBe("0");
  });

  it.each(["--motion-parallax", "--motion-ambient"])("%s is on by default", (prop) => {
    // Non-zero is what "enabled" means; the exact amplitude is a design choice
    // the tier layer scales, so this asserts the switch rather than the value.
    expect(Number(valueOf(baseRootBlock(), prop))).toBeGreaterThan(0);
  });
});
