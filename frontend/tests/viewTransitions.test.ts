import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The route cross-fade, pinned where each half of it lives.
 *
 * Two halves, two ways to break:
 *
 * 1. The fade is CSS on pseudo-elements jsdom cannot see at all — a removed
 *    `::view-transition` rule, or one whose duration was retuned to a
 *    multi-second scene, would pass every component test. So the stylesheet
 *    is read as text, the same dodge motionSwitches.test.ts uses.
 * 2. The fade is *opt-in per navigation* through React Router's
 *    `viewTransition` prop, and the opt-in is spread across a dozen links.
 *    The board row and the landing card are the two navigations the whole
 *    feature exists for; if either loses the prop, the cross-fade is gone
 *    from the app's most-travelled path while every other assertion still
 *    passes.
 *
 * What is deliberately NOT asserted: that query-only navigations (filters,
 * pagination) lack the prop. Absence-by-source-scan pins an implementation
 * detail, not a behaviour — those flows go through `setSearchParams`, which
 * has no viewTransition option at all, so they cannot regress into fading.
 */

const CSS = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");

function source(relative: string): string {
  return readFileSync(resolve(__dirname, relative), "utf8");
}

describe("route cross-fades", () => {
  it("styles the root transition with the motion tokens", () => {
    expect(CSS).toContain("::view-transition-old(root)");
    expect(CSS).toContain("::view-transition-new(root)");
    // The duration is the token, not a literal: 200ms is a design decision
    // that belongs to the same scale as every other transition in the app.
    expect(CSS).toMatch(/::view-transition-old\(root\),\s*\n\s*::view-transition-new\(root\)\s*\{\s*\n\s*animation-duration:\s*var\(--dur-base\);/);
  });

  it("gives the persistent chrome names that hold it still", () => {
    // One name per element: two live elements sharing a name abort every
    // transition on the page, so the two chrome classes must name different
    // view-transition-names.
    const nav = CSS.match(/\.site-chrome-nav\s*\{[^}]*view-transition-name:\s*([^;]+);/);
    const footer = CSS.match(/\.site-chrome-footer\s*\{[^}]*view-transition-name:\s*([^;]+);/);
    expect(nav, ".site-chrome-nav must set a view-transition-name").not.toBeNull();
    expect(footer, ".site-chrome-footer must set a view-transition-name").not.toBeNull();
    expect(nav![1].trim()).not.toBe(footer![1].trim());
  });

  it("collapses the pseudos under reduced motion", () => {
    // The one rule the universal `*` collapse in @layer base cannot reach:
    // view-transition pseudos are not matched by the universal selector, so
    // without this block a reduced-motion user gets the fade on every route
    // change while everything else collapses.
    const blocks = CSS.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^]*?\n\}/g) ?? [];
    const vtBlock = blocks.find((b) => b.includes("::view-transition"));
    expect(vtBlock, "no reduced-motion block touches ::view-transition").toBeDefined();
    expect(vtBlock).toMatch(/::view-transition-old\(\*\)/);
    expect(vtBlock).toMatch(/animation:\s*none\s*!important/);
  });

  it("carries the prop on the board row and the landing card", () => {
    const job = source("../src/components/Job.tsx");
    const card = source("../src/components/LatestJobCards.tsx");
    // The `to` template followed by the prop on the next line — the shape
    // every job link takes, so a prop dropped from either reads as a miss.
    const toThenProp = /to=\{`\/description\/\$\{job\.id\}`\}\s*\n\s*viewTransition/;
    expect(job).toMatch(toThenProp);
    expect(card).toMatch(toThenProp);
  });
});
