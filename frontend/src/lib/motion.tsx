import { motion, useReducedMotion, type Variants } from "motion/react";
import { type ReactNode } from "react";

import { useInViewOnce } from "./motion/scroll";
import { DUR_BASE, DUR_SLOW, EASE_OUT_QUINT } from "./motion/timing";

/**
 * The entrance composables — `FadeIn`, `StaggerList`/`StaggerItem`, `Reveal` —
 * and nothing else. This module exports components and no plain values: the
 * timing constants live in `motion/timing.ts` and the in-view hook in
 * `motion/scroll.ts`, because a module exporting both a component and a plain
 * value loses Fast Refresh for the component.
 *
 * Import either through `@/lib/motion` (components) or `@/lib/motion/index`
 * (composables) — never `motion/react` directly from a page. Feedback motion
 * (Tier 3) has no component here: it is the components' own transitions and
 * NumberFlow's count animation, which survive every tier by design.
 */

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

// Tier 1 (ambient) is not a component at all: it is the Atmosphere layer and
// the CSS variables the tier resolver sets, and nothing here wraps it.
/**
 * Tier 2 — a section arriving as it comes into view.
 *
 * A component, and deliberately not a hook returning motion props: the caller
 * would spread those props onto a `motion` element in the page, and a page
 * importing `motion/react` is the thing the convention forbids — the
 * composables are what honour `prefers-reduced-motion`, so bypassing them is
 * how a surface quietly stops honouring it.
 *
 * It is CSS, not framer-motion, and that is the point. The hidden offset is
 * `var(--motion-reveal-distance)`, so the `response` tier's `0px` and
 * `index.css`'s reduced-motion collapse both apply without this component ever
 * asking which surface it is on — the same indirection density and signal colour
 * use. A version that read the tier and picked a number would need correcting
 * for every surface added after it.
 *
 * Under reduced motion `useInViewOnce` reports in-view immediately, so the
 * element mounts in its end state and no transition runs at all. Animating to
 * the end state would still be an animation.
 *
 * Children are always in the DOM. A reveal animates something already rendered;
 * it must never be the reason text is missing — and `@media print` in index.css
 * pins `[data-reveal]` fully visible, because a printed page never scrolls.
 */
export function Reveal({
  children,
  className,
  /** Seconds to stagger a sibling behind the one before it. */
  delay = 0,
}: MotionChildren & { delay?: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-reveal=""
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        // `0px` fallback, not a bare var(): a surface that passes no `motion`
        // prop to PageShell sets no custom property, and an unresolved var makes
        // the whole declaration invalid — which happens to degrade to
        // opacity-only, but by accident. The fallback says so on purpose.
        translate: inView ? "none" : "0 var(--motion-reveal-distance, 0px)",
        // The CSS tokens, not `timing.ts`'s bezier array. That array exists
        // because framer-motion cannot read a custom property; CSS can, so
        // going through `timing.ts` here would duplicate index.css's numbers in
        // a second place and let the two drift.
        transition: `opacity var(--dur-slow) var(--ease-out-quint) ${delay}s, translate var(--dur-slow) var(--ease-out-quint) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
