import { motion, useReducedMotion, type Variants } from "motion/react";
import { type ReactNode, type RefObject } from "react";

import type { MotionTier } from "@/components/layout/PageShell";
import { motionAllows } from "./motion/dataset";
import { useInViewOnce, useScrollProgress } from "./motion/scroll";

// Mirrors --ease-out-quint / --dur-* from index.css. motion takes
// seconds and a bezier array, so the CSS custom properties can't be read
// directly; keep these in sync with index.css.
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
export const DUR_FAST = 0.12;
export const DUR_BASE = 0.2;
export const DUR_SLOW = 0.38;

type MotionChildren = { children: ReactNode; className?: string };

export function FadeIn({ children, className, delay = 0 }: MotionChildren & { delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR_SLOW, ease: EASE_OUT_QUINT, delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DUR_BASE, ease: EASE_OUT_QUINT } },
};

export function StaggerList({ children, className }: MotionChildren) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: MotionChildren) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

export function HoverLift({ children, className }: MotionChildren) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      transition={{ duration: DUR_FAST, ease: EASE_OUT_QUINT }}
    >
      {children}
    </motion.div>
  );
}

export function SharedElement({
  children,
  layoutId,
  className,
}: MotionChildren & { layoutId: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      layoutId={layoutId}
      transition={{ duration: DUR_BASE, ease: EASE_OUT_QUINT }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Tier 1/2 — ambient + scroll narrative, driven by the `data-motion` budget
 * PageShell sets. These collapse to nothing under `prefers-reduced-motion` and
 * to flat at the `response` tier (the workspace). The primitives above are
 * Tier 3 and untouched by this section.
 * ------------------------------------------------------------------------- */

/**
 * The resolved motion budget for the surface a ref lives on, in terms a
 * component acts on. All three inputs converge here so a page reads
 * `budget.reveal.style` and never branches on its environment: the
 * `data-motion` ancestor (workspace vs marketing), the user's reduced-motion
 * setting, and the timing contract above.
 */
export type MotionBudget = {
  /** CSS for a one-shot element reveal (translate driven by the resolved distance). */
  reveal: { style: { opacity: number; translate: string } };
  /** Whether scroll-progress parallax may run on this surface. */
  parallax: boolean;
  /** Whether ambient (infinite, decorative) loops may run on this surface. */
  ambient: boolean;
};

const RESPONSE_BUDGET: MotionBudget = {
  reveal: { style: { opacity: 1, translate: "none" } },
  parallax: false,
  ambient: false,
};

/**
 * Reads the element's `data-motion` ancestor and reports what this surface
 * allows. A null or unmounted ref (portal target, pre-mount) returns the
 * workspace budget: nothing reducible, feedback intact.
 */
export function useMotionBudget(ref: RefObject<Element | null> | null): MotionBudget {
  const reduced = useReducedMotion() ?? false;
  if (ref === null || ref.current === null) {
    return RESPONSE_BUDGET;
  }
  const tierAttr = ref.current.closest("[data-motion]")?.getAttribute("data-motion") ?? null;
  const tier = (tierAttr as MotionTier | null) ?? "response";
  if (tier === "response") {
    return RESPONSE_BUDGET;
  }
  return {
    reveal: reduced
      ? { style: { opacity: 1, translate: "none" } }
      : { style: { opacity: 0, translate: "0 var(--motion-reveal-distance)" } },
    parallax: !reduced && motionAllows(ref.current, "narrative"),
    ambient: !reduced && motionAllows(ref.current, "ambient"),
  };
}

/**
 * In-view reveal driven by the CSS budget. Returns a ref and motion props to
 * spread onto a `motion` element the page already owns: the hook supplies the
 * choreography; the caller keeps its DOM.
 */
export function useReveal<T extends HTMLElement>() {
  const { ref, inView } = useInViewOnce<T>();
  const reduced = useReducedMotion() ?? false;
  const y = reduced ? "0px" : "var(--motion-reveal-distance)";
  return {
    ref,
    initial: { opacity: reduced ? 1 : 0, y },
    animate: inView ? { opacity: 1, y: "0px" } : { opacity: reduced ? 1 : 0, y },
    transition: { duration: reduced ? 0 : DUR_SLOW, ease: EASE_OUT_QUINT },
  };
}

/**
 * Scroll narrative for an element: a mutable progress ref a canvas or transform
 * consumer reads on the shared clock, so the narrative is paint-level, not
 * state-level. Collapses to progress 1 (fully traversed) under reduced motion
 * and never re-renders per frame.
 */
export function useParallax<T extends HTMLElement>() {
  return useScrollProgress<T>();
}
