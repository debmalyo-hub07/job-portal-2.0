import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

import { Reveal } from "@/lib/motion";
import { AnimatedNumber } from "@/lib/numberFlow";
import PageShell from "@/components/layout/PageShell";

/**
 * `Reveal` is the first consumer of the Tier 1/2 machinery 4A shipped with none.
 *
 * The contract that matters is that it collapses **by parameter, not by
 * branching**: the hidden offset is `var(--motion-reveal-distance)`, which the
 * `response` tier pins to `0px` and `index.css` collapses under
 * `prefers-reduced-motion`. A component reading the surface and choosing a
 * number would have to be corrected on every new surface; this one cannot be
 * wrong about a surface it has never heard of.
 */

/** Point matchMedia at a given reduced-motion answer for one test. */
function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

afterEach(() => setReducedMotion(false));

describe("Reveal", () => {
  it("renders its children whether or not it has been revealed", () => {
    // The content is in the DOM from the first paint. A reveal animates
    // something already present; it must never be the reason text is absent.
    render(
      <Reveal>
        <p>Cairn holds the resume</p>
      </Reveal>,
    );
    expect(screen.getByText("Cairn holds the resume")).toBeInTheDocument();
  });

  it("starts hidden when motion is allowed, so the reveal is real", () => {
    // jsdom's IntersectionObserver stub never intersects, so this is the
    // pre-reveal state. If it were already revealed here the component would be
    // a no-op wrapper and every assertion below would pass vacuously.
    const { container } = render(
      <Reveal>
        <p>body</p>
      </Reveal>,
    );
    const el = container.querySelector("[data-reveal]") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.opacity).toBe("0");
  });

  it("keeps un-revealed content in the accessibility tree", () => {
    // Opacity is a paint concern; `aria-hidden` or `display: none` would be a
    // content concern. A screen-reader user does not scroll an element into view
    // to make the observer fire, so a reveal that hid its children from the tree
    // would make every section below the first screen unreachable.
    render(
      <Reveal>
        <h2>Matching preferences</h2>
      </Reveal>,
    );
    expect(screen.getByRole("heading", { name: "Matching preferences" })).toBeInTheDocument();
  });

  it("offsets by the tier variable, never by a literal", () => {
    const { container } = render(
      <Reveal>
        <p>body</p>
      </Reveal>,
    );
    const el = container.querySelector("[data-reveal]") as HTMLElement;
    // The response tier sets this to 0px and reduced motion collapses the :root
    // switch, so a literal here would defeat both at once.
    expect(el.style.translate).toContain("--motion-reveal-distance");
  });

  it("mounts already revealed under prefers-reduced-motion", () => {
    setReducedMotion(true);
    const { container } = render(
      <Reveal>
        <p>body</p>
      </Reveal>,
    );
    const el = container.querySelector("[data-reveal]") as HTMLElement;
    // Revealed on the *first* render, not transitioned to: an element that
    // animates to its end state has still animated.
    expect(el.style.opacity).toBe("1");
    expect(el.style.translate).toBe("none");
  });

  it("is inert on a response-tier surface, without knowing it is on one", () => {
    // The component gets no prop and reads no tier. PageShell's inline
    // `--motion-reveal-distance: 0px` is the whole mechanism.
    const { container } = render(
      <PageShell motion="response">
        <Reveal>
          <p>body</p>
        </Reveal>
      </PageShell>,
    );
    const shell = container.querySelector("[data-motion]") as HTMLElement;
    expect(shell.style.getPropertyValue("--motion-reveal-distance")).toBe("0px");
    const el = container.querySelector("[data-reveal]") as HTMLElement;
    expect(el.style.translate).toContain("--motion-reveal-distance");
  });

  it("carries no landmark, role or heading of its own", () => {
    // It is a presentational wrapper. Wrapping a section in something with a
    // role would add a node to the accessibility tree for a visual effect.
    const { container } = render(
      <Reveal>
        <p>body</p>
      </Reveal>,
    );
    const el = container.querySelector("[data-reveal]") as HTMLElement;
    expect(el.getAttribute("role")).toBeNull();
    expect(el.tagName).toBe("DIV");
  });
});

/**
 * Both of these exercise the **fallback**, not the animation.
 * `useIsSupported()` is false in jsdom — the custom element never upgrades — so
 * the wrapper takes its plain-`<span>` branch here. That is deliberate and worth
 * stating: it means these two assert the degradation path, which is the one that
 * used to throw, and the animated path is only observable in a real browser
 * (tests/visual). Reading them as coverage of NumberFlow itself would be wrong.
 */
describe("AnimatedNumber", () => {
  it("shows the number, so a count is readable however it animates", () => {
    render(<AnimatedNumber value={42} />);
    // The custom element renders a plain span alongside its shadow template, so
    // the figure is real text rather than something only a shadow root paints.
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("updates when the value changes", () => {
    const { rerender } = render(<AnimatedNumber value={3} />);
    rerender(<AnimatedNumber value={17} />);
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});

/**
 * CLAUDE.md has said "never import framer-motion in a page" since 2B-1 and
 * nothing enforced it. The rule is load-bearing rather than stylistic: the
 * composables in `lib/` are where `prefers-reduced-motion` is honoured, so a
 * page importing the library directly gets motion that ignores the user's
 * setting, and it does so invisibly — the page looks fine to whoever wrote it.
 *
 * Phase 5 adds a second library with the same property, so the rule is stated
 * once here as "motion libraries are imported under src/lib only".
 */
describe("the motion import convention", () => {
  const MOTION_PACKAGES = ["motion/react", "framer-motion", "@number-flow/react"];

  const files = globSync("src/**/*.{ts,tsx}", {
    cwd: resolve(__dirname, ".."),
  }).map((rel) => rel.replace(/\\/g, "/"));

  it("read a real source tree", () => {
    // workspaceRoutes.test.tsx once resolved its root to a nonexistent directory
    // and passed over zero files. A scan that finds nothing must fail loudly.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("src/lib/motion.tsx");
  });

  it.each(MOTION_PACKAGES)("%s is imported only from src/lib", (pkg) => {
    const offenders = files.filter((rel) => {
      if (rel.startsWith("src/lib/")) return false;
      const source = readFileSync(resolve(__dirname, "..", rel), "utf8");
      return new RegExp(`from ["']${pkg.replace(/[/@]/g, "\\$&")}["']`).test(source);
    });
    expect(offenders, `import ${pkg} through a composable in src/lib instead`).toEqual([]);
  });
});
