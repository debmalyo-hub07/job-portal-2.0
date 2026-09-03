import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ImageHero from "@/components/landing/ImageHero";

/** jsdom's requestAnimationFrame fires on a ~16ms timer; await one frame. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function renderHero() {
  const utils = render(
    <ImageHero
      portal="seeker"
      src="/hero.jpg"
      alt="Team collaborating"
      objectPosition="center 56%"
      mobileObjectPosition="65% 56%"
    >
      <h1>Work that fits</h1>
    </ImageHero>,
  );
  const hero = utils.container.querySelector("[data-hero-media]") as HTMLElement;
  Object.defineProperty(hero, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
  });
  return { ...utils, hero };
}

describe("ImageHero", () => {
  it("keeps the photograph as the visual layer and exposes pointer feedback", async () => {
    const { container, hero } = renderHero();
    const image = container.querySelector("img");

    expect(hero).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", "Team collaborating");
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(hero.style.getPropertyValue("--hero-image-position")).toBe("center 56%");
    expect(hero.style.getPropertyValue("--hero-image-position-mobile")).toBe("65% 56%");

    fireEvent.pointerMove(hero, { clientX: 750, clientY: 125, pointerType: "mouse" });
    await nextFrame();
    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("75%");
    expect(hero.style.getPropertyValue("--hero-pointer-y")).toBe("25%");
    expect(hero.style.getPropertyValue("--hero-depth-x")).toBe("-3.00px");
    expect(hero.style.getPropertyValue("--hero-depth-y")).toBe("2.00px");
  });

  it("defers the write to a frame and coalesces a burst into the latest position", async () => {
    const { hero } = renderHero();

    fireEvent.pointerMove(hero, { clientX: 100, clientY: 400, pointerType: "mouse" });
    // Nothing is written yet: the write lands in the next frame, not in the
    // event, so a burst of moves costs one style write rather than one per event.
    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("");

    fireEvent.pointerMove(hero, { clientX: 750, clientY: 125, pointerType: "mouse" });
    await nextFrame();

    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("75%");
    expect(hero.style.getPropertyValue("--hero-pointer-y")).toBe("25%");
    // The reticle is positioned by these, in px, so CSS can move it with the
    // `translate` property — compositor work — instead of `top`/`left`.
    expect(hero.style.getPropertyValue("--hero-cursor-x")).toBe("750.0px");
    expect(hero.style.getPropertyValue("--hero-cursor-y")).toBe("125.0px");
  });

  it("cancels the pending frame when the pointer leaves", async () => {
    const { hero } = renderHero();

    fireEvent.pointerMove(hero, { clientX: 750, clientY: 125, pointerType: "mouse" });
    fireEvent.pointerLeave(hero);

    // Reset immediately, and the cancelled frame must not re-apply the stale
    // position after the fact.
    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("50%");
    expect(hero.style.getPropertyValue("--hero-pointer-y")).toBe("50%");
    expect(hero.style.getPropertyValue("--hero-depth-x")).toBe("0px");
    expect(hero.style.getPropertyValue("--hero-depth-y")).toBe("0px");

    await nextFrame();
    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("50%");
    expect(hero.style.getPropertyValue("--hero-pointer-y")).toBe("50%");
  });

  it("ignores touch pointers, which have no hover to track", async () => {
    const { hero } = renderHero();

    fireEvent.pointerMove(hero, { clientX: 750, clientY: 125, pointerType: "touch" });
    await nextFrame();

    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("");
    expect(hero.style.getPropertyValue("--hero-cursor-x")).toBe("");
  });
});

/**
 * The scroll drift, pinned where it lives. jsdom cannot run scroll-driven
 * animations (no layout, no timeline), so the stylesheet is read as text —
 * the same dodge motionSwitches.test.ts and viewTransitions.test.ts use —
 * and the three ways the drift can silently break are asserted directly:
 *
 * 1. Ungated `animation-timeline` would put the drift on browsers that
 *    cannot run it and get a broken rule instead of today's hero.
 * 2. The drift must animate `translate`, never `transform`: the image's
 *    `transform` carries the pointer depth and its 900ms easing, and an
 *    animation that owns `transform` overrides transitions outright — the
 *    pointer parallax would snap instead of easing while the timeline is
 *    attached. `translate` composes with `transform` (it applies first), so
 *    the two depths add and each keeps its own behaviour.
 * 3. The reduced-motion collapse must come later in the source: both rules
 *    address `.hero-media__image` at the same specificity, so the collapse
 *    only wins by cascade order.
 */
const CSS = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");

describe("the hero's scroll drift", () => {
  it("gates the drift behind scroll-timeline support", () => {
    const supports = CSS.match(/@supports\s*\(animation-timeline:\s*view\(\)\)\s*\{[^]*?\n {2}\}/);
    expect(supports, "no @supports (animation-timeline: view()) block").not.toBeNull();
    const block = supports![0];
    expect(block).toMatch(/\.hero-media__image\s*\{/);
    // Shorthand first, longhands after: `animation:` written after
    // `animation-timeline:` would reset the timeline to auto.
    expect(block).toMatch(/animation:\s*hero-photo-exit\s+linear\s+both\s*;/);
    expect(block).toMatch(/animation-timeline:\s*--hero-exit\s*;/);
    expect(block).toMatch(/animation-range:\s*exit\s*;/);
  });

  it("declares the timeline on the section, under the name the image runs on", () => {
    // A bare `view()` on the image cannot work: its nearest ancestor scroll
    // container is the hero's own `overflow: hidden`, so the timeline would
    // measure the image in a box that never scrolls and the drift would pin
    // at zero — a silently dead animation that looks fine in the source. The
    // timeline must live on the section (measured in the document scroller)
    // and the two names must match exactly.
    expect(CSS).toMatch(/\.hero-media\s*\{[^}]*view-timeline-name:\s*--hero-exit\s*;/s);
    const declared = CSS.match(/view-timeline-name:\s*(--[\w-]+)/);
    const consumed = CSS.match(/animation-timeline:\s*(--[\w-]+)\s*;/);
    expect(declared, "no view-timeline-name declared").not.toBeNull();
    expect(consumed, "no named animation-timeline set").not.toBeNull();
    expect(consumed![1]).toBe(declared![1]);
  });

  it("drifts the photo on translate, leaving transform to the pointer depth", () => {
    const drift = CSS.match(/@keyframes\s+hero-photo-exit\s*\{[^]*?\n\}/);
    expect(drift, "no hero-photo-exit keyframes").not.toBeNull();
    expect(drift![0]).toContain("translate:");
    expect(drift![0]).not.toContain("transform:");
  });

  it("collapses the drift under reduced motion, after the drift rule in the cascade", () => {
    const reduced = CSS.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^]*?\n\}/g) ?? [];
    const heroBlock = reduced.find((block) =>
      new RegExp(/\.hero-media__image[^{]*\{[^}]*animation:\s*none/).test(block),
    );
    expect(heroBlock, "no reduced-motion block stops the hero image's animation").toBeDefined();
    // Same-specificity rules are decided by source order, so the collapse is
    // only a collapse while it sits below the @supports drift rule.
    expect(CSS.indexOf(heroBlock!)).toBeGreaterThan(CSS.indexOf("@supports (animation-timeline: view())"));
  });

  it("does not trap the hero in a scroll container on either landing", () => {
    // `overflow-x: hidden` computes the block axis to `auto`, which makes the
    // wrapper a scroll container — and the named timeline resolves the
    // subject's nearest ancestor scroller, so a hidden wrapper pins the drift
    // at one constant progress regardless of page scroll. This exact trap
    // shipped once and looked fine in the source; `clip` stops the same
    // horizontal overflow without becoming a scroller.
    for (const page of ["../src/components/Home.tsx", "../src/pages/HireLanding.tsx"]) {
      const src = readFileSync(resolve(__dirname, page), "utf8");
      expect(src, `${page} must clip without becoming a scroll container`).toContain(
        "overflow-x-clip",
      );
      expect(src, `${page} must not wrap the hero in overflow-x-hidden`).not.toContain(
        "overflow-x-hidden",
      );
    }
  });
});
