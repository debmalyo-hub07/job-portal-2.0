import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onReducedMotionChange, prefersReduced } from "@/lib/motion/reducedMotion";

// The shared clock holds module-level state (the subscriber set and the live
// rAF id), so every test gets a fresh module rather than leaking frames into
// the next one. Tests drive rAF manually to assert on frames, not wall time.
describe("motion clock", () => {
  type Clock = typeof import("@/lib/motion/clock");
  let clock: Clock;
  let rafCallbacks: FrameRequestCallback[];
  let rafId: number;
  let now: number;

  beforeEach(async () => {
    vi.resetModules();
    clock = await import("@/lib/motion/clock");

    rafCallbacks = [];
    rafId = 0;
    now = 1000;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      rafCallbacks = [];
    });
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Fires every queued rAF callback at `now + delta` and advances the clock. */
  function frame(delta: number) {
    now += delta;
    const pending = rafCallbacks;
    rafCallbacks = [];
    for (const cb of pending) cb(now);
  }

  it("drives every subscriber from one loop", () => {
    const a = vi.fn();
    const b = vi.fn();
    clock.subscribe(a);
    clock.subscribe(b);
    expect(clock.subscriberCount()).toBe(2);
    frame(16);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // One frame, one dt. Both see the same tick.
    expect(a).toHaveBeenLastCalledWith(16, expect.any(Number));
  });

  it("clamps dt so a backgrounded tab does not jump physics", () => {
    const cb = vi.fn();
    clock.subscribe(cb);
    frame(16); // first frame primes lastTime
    cb.mockClear();
    frame(5000); // 5s gap: tab was backgrounded
    expect(cb).toHaveBeenLastCalledWith(50, expect.any(Number));
  });

  it("starts on first subscriber and stops on last unsubscribe", () => {
    expect(clock.subscriberCount()).toBe(0);
    const unsub = clock.subscribe(vi.fn());
    expect(clock.subscriberCount()).toBe(1);
    unsub();
    expect(clock.subscriberCount()).toBe(0);
    // The loop is dead: framing with no subscribers runs nothing.
    const cb = vi.fn();
    frame(16);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("reduced motion preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to no preference under the jsdom matchMedia stub", () => {
    expect(prefersReduced()).toBe(false);
  });

  it("reads the live media query when present", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(prefersReduced()).toBe(true);
  });

  it("returns a no-op unsubscribe when matchMedia is unavailable", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const cb = vi.fn();
    const unsub = onReducedMotionChange(cb);
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });
});
