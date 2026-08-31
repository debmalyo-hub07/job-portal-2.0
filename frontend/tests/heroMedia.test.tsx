import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

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
