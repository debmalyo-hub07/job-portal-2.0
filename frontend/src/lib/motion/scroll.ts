import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll, useInView } from "motion/react";
import type { RefObject } from "react";

import { prefersReduced } from "./reducedMotion";

/**
 * Scroll-driven composables, all reading the shared clock's cadence through
 * motion@13 rather than managing their own listeners.
 *
 * `useScrollProgress` returns a mutable ref so a consumer that maps scroll to
 * a canvas offset or a WebGL uniform updates on the frame without re-rendering
 * React — the spec's scroll narrative is paint-level, not state-level.
 * jsdom collapses every layout dimension to 0, so progress is untestable in
 * jsdom by design; tests assert on the ref + reduced-motion contract instead.
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

/**
 * Returns a ref and a mutable ref of scroll progress (0–1) as the element
 * traverses the viewport. The consumer reads `progress.current` inside a
 * rAF/animation callback; it never re-renders per frame.
 *
 * With reduced motion on, progress is pinned to 1 (fully traversed) so the
 * end state of any scroll narrative is what a reduced-motion user sees.
 */
export function useScrollProgress<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  progress: RefObject<number>;
} {
  const ref = useRef<T | null>(null);
  const progress = useRef(prefersReduced() ? 1 : 0);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!prefersReduced()) {
      progress.current = v;
    }
  });

  // A reduced-motion flag flipped live (not via reload) settles to the end.
  useEffect(() => {
    if (prefersReduced()) {
      progress.current = 1;
    }
  }, []);

  return { ref, progress };
}
