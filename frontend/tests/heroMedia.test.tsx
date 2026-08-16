import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import ImageHero from "@/components/landing/ImageHero";

describe("ImageHero", () => {
  it("keeps the photograph as the visual layer and exposes pointer feedback", () => {
    const { container } = render(
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
    const hero = container.querySelector("[data-hero-media]") as HTMLElement;
    const image = container.querySelector("img");

    expect(hero).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", "Team collaborating");
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(hero.style.getPropertyValue("--hero-image-position")).toBe("center 56%");
    expect(hero.style.getPropertyValue("--hero-image-position-mobile")).toBe("65% 56%");

    Object.defineProperty(hero, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
    });
    fireEvent.pointerMove(hero, { clientX: 750, clientY: 125, pointerType: "mouse" });
    expect(hero.style.getPropertyValue("--hero-pointer-x")).toBe("75%");
    expect(hero.style.getPropertyValue("--hero-pointer-y")).toBe("25%");
    expect(hero.style.getPropertyValue("--hero-depth-x")).toBe("-3.00px");
    expect(hero.style.getPropertyValue("--hero-depth-y")).toBe("2.00px");
  });
});
