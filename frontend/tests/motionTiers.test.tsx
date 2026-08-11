import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import PageShell from "@/components/layout/PageShell";

// PageShell is a pure layout primitive: no Redux, no router. jsdom reports
// inline custom properties as their *specified* value on computed style (a
// reducible tier prop reads "var(--motion-distance)" because index.css, not
// the component, owns the reduced-motion collapse). So we assert the full
// per-tier vocabulary, including the indirection itself.
//
// The tier-scoped names differ from the :root names on purpose. Until Phase 5
// this file asserted `--motion-parallax: var(--motion-parallax)`, which is a
// self-reference — a CSS cycle that resolves to the empty string, so the
// property was dead on every surface and any consumer parsing it got NaN. The
// assertions passed throughout, because they pinned the specified string rather
// than what it resolved to. Distinct names (`--motion-parallax-depth` ←
// `--motion-parallax`) are what make the indirection actually resolve, matching
// the `--motion-reveal-distance` ← `--motion-distance` pair that always worked.
// `motionSwitches.test.ts` covers the :root values those names point at.
describe("PageShell motion tiers", () => {
  it("does not set data-motion by default", () => {
    const { container } = render(<PageShell>content</PageShell>);
    expect(container.firstElementChild?.hasAttribute("data-motion")).toBe(false);
  });

  it("sets data-motion from the prop", () => {
    const { container } = render(<PageShell motion="ambient">content</PageShell>);
    expect(container.firstElementChild?.getAttribute("data-motion")).toBe("ambient");
  });

  it("never declares a tier variable as a self-reference", () => {
    // The defect this file missed for a whole phase. A cyclic declaration is
    // invisible to a specified-value assertion, so it is asserted structurally:
    // no tier may set a property to a var() of its own name.
    for (const tier of ["ambient", "standard", "response"] as const) {
      const { container } = render(<PageShell motion={tier}>content</PageShell>);
      const style = (container.firstElementChild as HTMLElement).getAttribute("style") ?? "";
      for (const [, prop, ref] of style.matchAll(/(--[\w-]+):\s*[^;]*var\((--[\w-]+)/g)) {
        expect(prop, `${tier} declares ${prop} as a cycle`).not.toBe(ref);
      }
    }
  });

  it("ambient opts into every reducible dimension", () => {
    const { container } = render(<PageShell motion="ambient">content</PageShell>);
    const cs = getComputedStyle(container.firstElementChild as HTMLElement);
    expect(cs.getPropertyValue("--motion-reveal-opacity").trim()).toBe("1");
    expect(cs.getPropertyValue("--motion-reveal-distance").trim()).toBe("var(--motion-distance)");
    expect(cs.getPropertyValue("--motion-parallax-depth").trim()).toBe("var(--motion-parallax)");
    expect(cs.getPropertyValue("--motion-ambient-amplitude").trim()).toBe("var(--motion-ambient)");
    expect(cs.getPropertyValue("--motion-feedback-scale").trim()).toBe("1");
  });

  it("standard keeps the scroll narrative and halves ambient", () => {
    const { container } = render(<PageShell motion="standard">content</PageShell>);
    const cs = getComputedStyle(container.firstElementChild as HTMLElement);
    expect(cs.getPropertyValue("--motion-reveal-distance").trim()).toBe("var(--motion-distance)");
    expect(cs.getPropertyValue("--motion-parallax-depth").trim()).toBe("var(--motion-parallax)");
    // Scaled rather than zeroed: browse and detail carry atmosphere behind
    // content someone is reading, so it runs at half a headline's amplitude.
    expect(cs.getPropertyValue("--motion-ambient-amplitude").trim()).toBe(
      "calc(var(--motion-ambient) * 0.5)",
    );
    expect(cs.getPropertyValue("--motion-feedback-scale").trim()).toBe("1");
  });

  it("response keeps feedback motion and a quarter-amplitude whisper", () => {
    const { container } = render(<PageShell motion="response">content</PageShell>);
    const cs = getComputedStyle(container.firstElementChild as HTMLElement);
    expect(cs.getPropertyValue("--motion-reveal-opacity").trim()).toBe("1");
    expect(cs.getPropertyValue("--motion-reveal-distance").trim()).toBe("0px");
    // Parallax stays a hard zero on the work surfaces: nothing moves behind a
    // data table. Phase 5 reversed 4A's criterion 6 for ambient only.
    expect(cs.getPropertyValue("--motion-parallax-depth").trim()).toBe("0");
    expect(cs.getPropertyValue("--motion-ambient-amplitude").trim()).toBe(
      "calc(var(--motion-ambient) * 0.25)",
    );
    expect(cs.getPropertyValue("--motion-feedback-scale").trim()).toBe("1");
  });
});
