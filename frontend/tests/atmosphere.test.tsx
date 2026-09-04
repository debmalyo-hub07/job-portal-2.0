import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import type { CSSProperties } from "react";

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

/**
 * A controllable IntersectionObserver: jsdom's stub never fires, so without
 * this the section stays off-screen and the shader is never asked to start.
 * The captured `fire` is module-level because the observer is constructed
 * inside the component's effect.
 */
let fireObserver: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

function stubControllableObserver() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        fireObserver = cb;
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
}

/** The MediaQueryList shape prefersReduced reads; matches is the only input. */
function mediaList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

/** The GL context stub, with drawArrays counted for the static-frame tests. */
let uniform1fSpy: ReturnType<typeof vi.fn> = vi.fn();

function stubGl(drawArrays: ReturnType<typeof vi.fn>) {
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
    // Name-tagged so a test can tell the uniforms apart and read what the
    // paint loop hands to each of them.
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    viewport: () => {},
    uniform2f: () => {},
    uniform1f: (...args: unknown[]) => uniform1fSpy(...args),
    uniform3f: () => {},
    drawArrays,
    deleteProgram: () => {},
    deleteShader: () => {},
    VERTEX_SHADER: 0,
    FRAGMENT_SHADER: 1,
    ARRAY_BUFFER: 2,
    STATIC_DRAW: 3,
    FLOAT: 4,
    TRIANGLES: 5,
  };
  uniform1fSpy = vi.fn();
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(gl as unknown as WebGLRenderingContext);
}

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

  it.each([
    ["paper", undefined, "bg-paper"],
    ["paper", "paper", "bg-paper"],
    ["media", "media", "bg-media-shade"],
  ] as const)(
    "paints the %s ground: host background and nothing else",
    (_ground, ground, bgClass) => {
      // The host's own background follows the ground so the never-drawn
      // canvas (no WebGL, no signal colour) dissolves into the surface the
      // caller placed the layer on — a black or white rectangle standing in
      // for a dark panel would be worse than no field at all.
      const { container } = render(<Atmosphere ground={ground} />);
      expect((container.firstElementChild as HTMLElement).className).toMatch(
        new RegExp(bgClass),
      );
    },
  );

  /**
   * The static first frame, which is three contracts at once:
   *
   * 1. Reduced motion shows the field held still at t=0, not nothing — the
   *    drift is what the user asked to reduce, not the colour.
   * 2. An alpha:false WebGL canvas that has never been drawn composites as
   *    opaque black; without the first draw, a reduced-motion visitor to a
   *    media-ground panel would see a black rectangle where the ground
   *    belongs.
   * 3. Drawing and subscribing are separate guards: this asserts a draw
   *    WITHOUT a subscription, which the loop-only implementation could not
   *    express — there, no subscription meant no paint at all.
   *
   * The signal colour comes from an inline custom property on a real
   * [data-portal] ancestor rather than from mocking readOklchVar, so the
   * test exercises the same resolution path the browser does. matchMedia is
   * spied (setup.ts leaves it writable) because prefersReduced() reads it
   * live, and the spy is reverted by this file's restoreAllMocks.
   */
  it("paints one static frame and opens no clock under reduced motion", () => {
    stubControllableObserver();
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
      mediaList(query.includes("reduce")),
    );

    const drawArrays = vi.fn();
    stubGl(drawArrays);

    const before = subscriberCount();
    render(
      <div data-portal="admin" style={{ "--signal": "oklch(0.545 0.255 320)" } as CSSProperties}>
        <Atmosphere ground="media" />
      </div>,
    );
    act(() => fireObserver!([{ isIntersecting: true }]));

    // The static frame painted exactly once — no clock, so exactly one draw.
    expect(drawArrays).toHaveBeenCalledTimes(1);
    // And the shared clock stayed closed.
    expect(subscriberCount()).toBe(before);
  });

  /**
   * The motion-enabled counterpart: same setup, matchMedia no-preference.
   * The static frame still paints (it is unconditional), and the clock opens
   * exactly one subscription for the drift.
   */
  it("paints the static frame and then subscribes when motion is allowed", () => {
    stubControllableObserver();
    vi.spyOn(window, "matchMedia").mockImplementation(() => mediaList(false));

    const drawArrays = vi.fn();
    stubGl(drawArrays);

    const before = subscriberCount();
    const { unmount } = render(
      <div data-portal="seeker" style={{ "--signal": "oklch(0.545 0.09 200)" } as CSSProperties}>
        <Atmosphere />
      </div>,
    );
    act(() => fireObserver!([{ isIntersecting: true }]));

    expect(drawArrays).toHaveBeenCalledTimes(1);
    expect(subscriberCount()).toBe(before + 1);

    unmount();
    expect(subscriberCount()).toBe(before);
  });

  /**
   * The clock speaks milliseconds (it accumulates performance.now() deltas);
   * the shader's uTime speaks seconds. The field this phase first mounted on
   * real pages shimmers when the two are confused: uTime fed milliseconds
   * races the noise advection a thousand times faster than designed, the
   * pattern decorrelates frame to frame, and what reads from a distance is
   * flickering light under the hero — invisible to any single-frame
   * screenshot, which is exactly how it shipped.
   *
   * jsdom cannot see the pixels, but it can see the uniform. The values handed
   * to uTime must advance at seconds' pace: no tick may move it by more than
   * the clock's own 50ms clamp, which in seconds is 0.05. Fed raw
   * milliseconds, even one 16ms frame moves it by 16 — a separation of three
   * orders of magnitude, so the bound is not tight enough to matter.
   */
  it("advects the field on seconds, not the clock's milliseconds", async () => {
    stubControllableObserver();
    vi.spyOn(window, "matchMedia").mockImplementation(() => mediaList(false));

    const drawArrays = vi.fn();
    stubGl(drawArrays);
    render(
      <div data-portal="seeker" style={{ "--signal": "oklch(0.545 0.09 200)" } as CSSProperties}>
        <Atmosphere />
      </div>,
    );
    act(() => fireObserver!([{ isIntersecting: true }]));

    // Let the shared clock tick a few frames — jsdom's rAF fires ~every 16ms.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    const times = uniform1fSpy.mock.calls
      .filter(([loc]) => (loc as { name?: string }).name === "uTime")
      .map(([, value]) => value as number);
    expect(times.length, "the clock never ticked — the loop is not running").toBeGreaterThan(2);
    const worstStep = Math.max(
      ...times.slice(1).map((value, i) => value - times[i]),
      0,
    );
    expect(
      worstStep,
      `uTime advanced ${worstStep} in one tick — the clock's milliseconds are reaching the shader`,
    ).toBeLessThan(1);
  });
});
