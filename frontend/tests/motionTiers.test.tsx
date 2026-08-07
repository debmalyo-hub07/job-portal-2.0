import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import PageShell from "@/components/layout/PageShell";

// PageShell is a pure layout primitive: no Redux, no router. jsdom reports
// inline custom properties as their *specified* value on computed style (a
// reducible tier prop reads "var(--motion-distance)" because index.css, not
// the component, owns the reduced-motion collapse). So we assert the full
// per-tier vocabulary, including the indirection itself.
describe("PageShell motion tiers", () => {
  it("does not set data-motion by default", () => {
    const { container } = render(<PageShell>content</PageShell>);
    expect(container.firstElementChild?.hasAttribute("data-motion")).toBe(false);
  });

  it("sets data-motion from the prop", () => {
    const { container } = render(<PageShell motion="ambient">content</PageShell>);
    expect(container.firstElementChild?.getAttribute("data-motion")).toBe("ambient");
  });

  it("ambient opts into every reducible dimension", () => {
    const { container } = render(<PageShell motion="ambient">content</PageShell>);
    const cs = getComputedStyle(container.firstElementChild as HTMLElement);
    expect(cs.getPropertyValue("--motion-reveal-opacity").trim()).toBe("1");
    expect(cs.getPropertyValue("--motion-reveal-distance").trim()).toBe("var(--motion-distance)");
    expect(cs.getPropertyValue("--motion-parallax").trim()).toBe("var(--motion-parallax)");
    expect(cs.getPropertyValue("--motion-ambient").trim()).toBe("var(--motion-ambient)");
    expect(cs.getPropertyValue("--motion-feedback-scale").trim()).toBe("1");
  });

  it("standard keeps the scroll narrative but drops ambient", () => {
    const { container } = render(<PageShell motion="standard">content</PageShell>);
    const cs = getComputedStyle(container.firstElementChild as HTMLElement);
    expect(cs.getPropertyValue("--motion-reveal-distance").trim()).toBe("var(--motion-distance)");
    expect(cs.getPropertyValue("--motion-parallax").trim()).toBe("var(--motion-parallax)");
    // Ambient is not reducible; it is a hard surface decision, hence a literal.
    expect(cs.getPropertyValue("--motion-ambient").trim()).toBe("0");
    expect(cs.getPropertyValue("--motion-feedback-scale").trim()).toBe("1");
  });

  it("response keeps only feedback motion", () => {
    const { container } = render(<PageShell motion="response">content</PageShell>);
    const cs = getComputedStyle(container.firstElementChild as HTMLElement);
    expect(cs.getPropertyValue("--motion-reveal-opacity").trim()).toBe("1");
    expect(cs.getPropertyValue("--motion-reveal-distance").trim()).toBe("0px");
    expect(cs.getPropertyValue("--motion-parallax").trim()).toBe("0");
    expect(cs.getPropertyValue("--motion-ambient").trim()).toBe("0");
    expect(cs.getPropertyValue("--motion-feedback-scale").trim()).toBe("1");
  });
});
