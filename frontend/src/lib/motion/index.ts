/**
 * The motion composables are the only door into animated behaviour. Pages and
 * components import from here; none imports `motion/react` directly, and none
 * branches on `data-motion` or `prefers-reduced-motion` itself.
 */
export { subscribe, subscriberCount } from "./clock";
export { prefersReduced, onReducedMotionChange } from "./reducedMotion";
export { useInViewOnce, useScrollProgress } from "./scroll";
export { motionAllows } from "./dataset";
export { useMotionBudget, useReveal, useParallax, type MotionBudget } from "./budget";
export { EASE_OUT_QUINT, DUR_FAST, DUR_BASE, DUR_SLOW } from "./timing";
