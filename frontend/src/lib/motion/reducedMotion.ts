/**
 * The user preference every Tier 1+2 motion collapses under, read live so a
 * browser-level change (or a browser extension flipping the setting) takes
 * effect without a reload.
 *
 * jsdom does not implement matchMedia; the test setup stubs it to "no
 * preference" so the animated branch runs by default and tests that need
 * reduced motion override the stub explicitly. SSR has no window, and a
 * server-render must never animate differently from hydrate, so the absent-
 * implementation case is "no preference" rather than "reduced".
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function mediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(QUERY);
}

export function prefersReduced(): boolean {
  return mediaQueryList()?.matches ?? false;
}

/**
 * Subscribes to changes in the reduced-motion preference. jsdom's stub has a
 * no-op addEventListener, so a test that flips the setting manually fires the
 * listener from the matchMedia stub or asserts on prefersReduced() directly.
 * Returns the unsubscribe function.
 *
 * jsdom's stubbed MediaQueryList has the legacy addListener shape as well as
 * the modern addEventListener, which is why this narrows through a structural
 * type rather than a cast: the stub and a real browser satisfy the same
 * contract.
 */
export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  const query = mediaQueryList();
  if (query === null) {
    return () => {};
  }
  const handler = (event: MediaQueryListEvent) => cb(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
