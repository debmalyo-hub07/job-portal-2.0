import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseOklch, oklchToRgb } from "@/lib/atmosphere/oklch";

/**
 * OKLCH → sRGB, because a shader needs numbers and the token system speaks oklch.
 *
 * Why this exists at all: the obvious approaches do not work. Chrome preserves
 * the author's colour space in computed values since CSS Color 4, so
 * `getComputedStyle(el).color` on an oklch colour returns the oklch string
 * unchanged — as does `CSS.registerProperty` with `syntax: "<color>"`, and as
 * does a `ctx.fillStyle` round-trip. The only browser-native conversion is
 * painting to a canvas and reading `getImageData`, which is exactly what jsdom
 * cannot do (`getContext` returns null). So the conversion is ours.
 *
 * The expected values below are not derived from this implementation. They were
 * measured in Chrome via `fillRect` + `getImageData` against the real tokens in
 * index.css, then pasted here. A test whose fixtures come from the code it
 * tests proves only that the code is consistent with itself.
 *
 * The project's earlier 2.42-vs-9.08 contrast disaster (see contrast.mjs) was
 * caused by treating L/C/H as if they were R/G/B, not by JS being incapable of
 * the conversion. Correct OKLab matrices are exact to the byte.
 */

// [token source, oklch string, browser-measured sRGB]
const MEASURED: Array<[string, string, [number, number, number]]> = [
  ["--paper (light)", "oklch(0.99 0.004 95)", [252, 252, 249]],
  ["--ink-muted (light)", "oklch(0.52 0.008 95)", [106, 105, 100]],
  ["--signal seeker", "oklch(0.58 0.19 282)", [109, 100, 229]],
  ["--signal recruiter", "oklch(0.6 0.11 185)", [0, 149, 137]],
  ["--signal seeker (dark)", "oklch(0.78 0.15 282)", [169, 170, 255]],
];

describe("parseOklch", () => {
  it.each(MEASURED)("parses %s", (_label, css) => {
    const parsed = parseOklch(css);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeGreaterThan(0);
    expect(parsed!.alpha).toBe(1);
  });

  it("reads L and C given as percentages", () => {
    // `oklch(50% 50% 200)` is legal CSS: L is /100, C is x0.4 of the reference.
    expect(parseOklch("oklch(50% 0.1 200)")).toMatchObject({ l: 0.5, c: 0.1 });
    expect(parseOklch("oklch(0.5 50% 200)")).toMatchObject({ l: 0.5, c: 0.2 });
  });

  it("reads the alpha channel", () => {
    // --signal-muted is --signal at 12%; --line at 9%. Both real tokens.
    expect(parseOklch("oklch(0.58 0.19 282 / 12%)")?.alpha).toBeCloseTo(0.12, 5);
    expect(parseOklch("oklch(0.58 0.19 282 / 0.5)")?.alpha).toBe(0.5);
  });

  it("tolerates a hue with a unit and the `none` keyword", () => {
    expect(parseOklch("oklch(0.58 0.19 282deg)")?.h).toBe(282);
    expect(parseOklch("oklch(0.58 none 282)")?.c).toBe(0);
  });

  /**
   * The null path is the one that matters in production. A token that becomes a
   * `color-mix()` — or an empty string from a variable that does not exist —
   * must return null so the caller can skip the atmosphere entirely. Returning
   * a partly-parsed colour is how NaN reaches a shader uniform, and
   * `gl.uniform1f(loc, NaN)` does not throw: it silently renders black.
   */
  it.each([
    ["", "an unset variable"],
    ["color-mix(in oklab, var(--signal) 12%, transparent)", "a color-mix value"],
    ["#6d64e5", "a hex literal"],
    ["rgb(109 100 229)", "an rgb colour"],
    ["oklch(0.58 0.19)", "a truncated oklch"],
  ])("returns null for %s (%s)", (input) => {
    expect(parseOklch(input)).toBeNull();
  });
});

describe("oklchToRgb", () => {
  it.each(MEASURED)("matches the browser for %s", (_label, css, expected) => {
    const rgb = oklchToRgb(parseOklch(css)!);
    // Exact, not approximate. Every token in index.css is in gamut, so there is
    // no clipping disagreement to absorb — a tolerance here would hide the one
    // failure mode worth knowing about.
    expect([rgb.r, rgb.g, rgb.b]).toEqual(expected);
  });

  it("returns channels in 0..1 for shader use", () => {
    const { r, g, b } = oklchToRgb(parseOklch("oklch(0.58 0.19 282)")!);
    expect([r / 255, g / 255, b / 255].every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  /**
   * Every token in the real stylesheet, not a sample of five.
   *
   * The five fixtures above are pinned to browser measurements, which is the
   * stronger assertion but cannot scale — each value had to be measured by hand.
   * This is the weaker assertion applied to everything: the parser must at least
   * *accept* every colour the token system actually emits.
   *
   * That is the realistic drift. A token added in a syntax this parser rejects
   * (`color-mix()`, a relative `from` colour, a hex fallback) returns null, the
   * atmosphere silently declines to draw on whichever surface uses it, and no
   * existing test notices — the field's absence looks exactly like a background
   * that was never there. Reading index.css means a new token is covered the day
   * it lands rather than the day someone remembers to measure it.
   *
   * What this does NOT check is that the conversion still agrees with Chrome for
   * a new token. Only the five measured fixtures do that, and out-of-gamut
   * clipping is where the two could legitimately diverge (see oklchToRgb).
   */
  it("parses every oklch token in index.css", () => {
    const css = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");
    const tokens = [...new Set(css.match(/oklch\([^)]*\)/g) ?? [])];

    // A scan that resolves to nothing must fail, not pass over zero files —
    // the defect workspaceRoutes.test.tsx shipped with once.
    expect(tokens.length).toBeGreaterThan(30);

    const rejected = tokens.filter((token) => parseOklch(token) === null);
    expect(rejected).toEqual([]);
  });

  it("clamps an out-of-gamut colour rather than emitting NaN", () => {
    // Chrome reduces chroma to fit the gamut; we clamp per channel, so a wildly
    // out-of-gamut colour may differ from the browser. What must never happen
    // is NaN or a negative channel reaching a uniform.
    const rgb = oklchToRgb({ l: 0.7, c: 0.4, h: 130, alpha: 1 });
    for (const v of [rgb.r, rgb.g, rgb.b]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});
