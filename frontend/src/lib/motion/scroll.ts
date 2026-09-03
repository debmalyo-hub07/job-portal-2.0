import { useRef } from "react";
import { useInView } from "motion/react";
import type { RefObject } from "react";

import { prefersReduced } from "./reducedMotion";

/**
 * Scroll-adjacent composables, reading the shared clock's cadence through
 * motion@13 rather than managing their own listeners.
 *
 * jsdom collapses every layout dimension to 0, so in-view state is only
 * drivable in tests through a stubbed observer (see landingStats.test.tsx);
 * the reduced-motion collapse is assertable directly.
 */

/** Returns a ref and a boolean that flips true the first time it enters view. */
export function useInViewOnce<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T | null>(null);
  const seen = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  // Under reduced motion the first-view reveal is the whole point of a
  // Tier 1/2 collapse: an element that would animate in is simply present.
  return { ref, inView: seen || prefersReduced() };
}
