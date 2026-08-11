import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

import { Atmosphere } from "@/lib/atmosphere/Atmosphere";
import { subscriberCount } from "@/lib/motion/clock";

/**
 * The ambient field, and the four ways it must refuse to run.
 *
 * This component is the first thing in the application to touch WebGL, so most
 * of what is worth asserting is negative: it must not throw where there is no
 * GL context, must not log, must not hold the shared clock open, and must not
 * intercept a click. jsdom gives us the first for free — `getContext` returns
 * null and `window.WebGLRenderingContext` is undefined — which makes it an
 * honest stand-in for a browser with a blocklisted GPU.
 *
 * What jsdom cannot check is what the field looks like. That belongs to
 * `tests/visual/`, which drives a real browser at a pinned clock phase.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Atmosphere", () => {
  it("renders a decorative layer that cannot take a click or the focus ring", () => {
    const { container } = render(<Atmosphere />);
    const layer = container.firstElementChild as HTMLElement;

    // aria-hidden because it carries no information — a screen reader announcing
    // "canvas" here would be pure noise.
    expect(layer).toHaveAttribute("aria-hidden", "true");
    // Without this, an inset-0 layer swallows every click in its container.
    expect(layer.className).toMatch(/pointer-events-none/);
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  /**
   * The whole point of the fallback ladder. jsdom's `getContext` returns null
   * for both "webgl" and "2d", and `window.WebGLRenderingContext` is undefined
   * — so a guard written as `instanceof WebGLRenderingContext` would throw
   * "Right-hand side of 'instanceof' is not callable" rather than fall through.
   */
  it("survives a canvas with no context at all", () => {
    expect(() => render(<Atmosphere />)).not.toThrow();
  });

  /**
   * `tests/visual/run.mjs` fails the whole screenshot run on any console error
   * that is not a CORS/network message. A "WebGL unavailable, falling back"
   * warning would therefore fail the visual suite on every machine whose GPU is
   * blocklisted — which is a real population, not a hypothetical one. The
   * fallback is silent by contract.
   */
  it("says nothing on the console when it cannot render", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Atmosphere />);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * The clock is shared and refcounted (`lib/motion/clock.ts`), so an atmosphere
   * that subscribed on mount would run a real rAF loop in every suite that
   * renders a page carrying one.
   *
   * The fake GL context below removes the trivial reason a subscription cannot
   * happen (`setup.ts` returns null from getContext), so what remains is the
   * guard in `canvasShader.ts`: no resolved `--signal`, no loop. In jsdom no
   * stylesheet loads, so `--signal` computes to the empty string and
   * `readOklchVar` returns null — the same state a browser reaches if a token
   * ever becomes a syntax the parser does not handle, such as `color-mix()`.
   *
   * Refusing to draw is the right answer there: with no signal colour the shader
   * would paint a flat paper rectangle over the section, burning a GPU loop to
   * produce something indistinguishable from no atmosphere at all.
   *
   * The observer is driven to intersecting below, which matters: the off-screen
   * pause would otherwise satisfy this assertion on its own and the signal guard
   * would go untested. Both reasons must be removed but one.
   *
   * Verified by mutation: making `readOklchVar` return a fixed colour opens a
   * subscription and fails this test.
   */
  it("does not open a clock subscription when it has no signal colour", () => {
    // A controllable observer: jsdom's stub never fires, so without this the
    // section stays off-screen and the shader is never asked to start.
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = "";
        thresholds = [];
      },
    );

    const gl = {
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      useProgram: () => {},
      createBuffer: () => ({}),
      bindBuffer: () => {},
      bufferData: () => {},
      getAttribLocation: () => 0,
      enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {},
      getUniformLocation: () => ({}),
      viewport: () => {},
      deleteProgram: () => {},
      deleteShader: () => {},
      VERTEX_SHADER: 0,
      FRAGMENT_SHADER: 1,
      ARRAY_BUFFER: 2,
      STATIC_DRAW: 3,
      FLOAT: 4,
      TRIANGLES: 5,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      gl as unknown as WebGLRenderingContext,
    );

    const before = subscriberCount();
    const { unmount } = render(<Atmosphere />);

    // Prove the observer was wired, then report the section as on screen. If this
    // throws, the test below is asserting nothing.
    expect(fire).not.toBeNull();
    act(() => fire!([{ isIntersecting: true }]));

    expect(subscriberCount()).toBe(before);

    unmount();
    expect(subscriberCount()).toBe(before);
  });

  /**
   * The off-screen pause. A section scrolled out of view must not hold the shared
   * rAF loop open — writing amplitude 0 into a running loop is not a pause, it is
   * a full-rate GPU draw producing an invisible result.
   *
   * Asserted through `getContext`: the shader asks for a context only once it has
   * decided to draw, so no request means no loop was started. That works here
   * precisely because `setup.ts` makes the call observable rather than letting
   * jsdom's own error carry it.
   */
  it("asks for no drawing context while it is off screen", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    render(<Atmosphere />);

    expect(getContext).not.toHaveBeenCalled();
  });

  it("accepts a className so a section can size and place it", () => {
    const { container } = render(<Atmosphere className="h-[32rem]" />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/h-\[32rem\]/);
  });
});
