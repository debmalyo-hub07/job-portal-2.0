import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// next-themes and framer-motion's useReducedMotion both read matchMedia, which
// jsdom does not implement. Default to "no preference" so motion composables
// take their animated branch; a test that wants reduced motion overrides this.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

/**
 * jsdom implements no IntersectionObserver, and embla-carousel constructs one
 * unconditionally on mount. Any test whose assertion ends on the landing page —
 * every "this guard bounces the wrong portal to /" case — renders
 * CategoryCarousel and dies in the observer's constructor rather than at its
 * own assertion.
 *
 * Never intersecting is the honest stub: jsdom gives every element a zero-sized
 * layout box, so nothing is genuinely in view.
 */
class NoopIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

/** Same story: embla also constructs a ResizeObserver, which jsdom lacks. */
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", NoopResizeObserver);

/**
 * jsdom implements no canvas context, and it reports that through
 * `console.error` — "Not implemented: HTMLCanvasElement's getContext() method"
 * — every single time one is requested. Since `Atmosphere` asks for a WebGL
 * context on mount, every suite that renders a page carrying one would emit
 * that line, and `tests/atmosphere.test.tsx` could not tell jsdom's noise apart
 * from a log of our own.
 *
 * Returning null is what a real browser does when WebGL is unavailable (a
 * blocklisted GPU, a hardened privacy setting), so this stub is not a fiction —
 * it is the fallback path, made assertable. The visual suite drives a real
 * browser and is where the shader itself is checked.
 */
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
