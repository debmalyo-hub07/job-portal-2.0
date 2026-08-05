import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

// Mirrors --ease-out-quint / --dur-* from index.css. framer-motion takes
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
