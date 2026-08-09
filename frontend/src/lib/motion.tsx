import { motion, useReducedMotion, type Variants } from "motion/react";
import { type ReactNode } from "react";

import { DUR_BASE, DUR_FAST, DUR_SLOW, EASE_OUT_QUINT } from "./motion/timing";

/**
 * Tier 3 — feedback. These are components, and this module exports nothing
 * else: the timing constants live in `motion/timing.ts` and the Tier 1/2 hooks
 * in `motion/budget.ts`, because a module exporting both a component and a
 * plain value loses Fast Refresh for the component.
 *
 * Import either through `@/lib/motion` (components) or `@/lib/motion/index`
 * (composables) — never `motion/react` directly from a page.
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

// Tier 1/2 (ambient + scroll narrative) are hooks, not components: see
// `motion/budget.ts` for `useMotionBudget`, `useReveal` and `useParallax`.
