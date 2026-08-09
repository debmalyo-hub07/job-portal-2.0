/**
 * The timing vocabulary, in the units `motion` takes.
 *
 * Mirrors `--ease-out-quint` / `--dur-*` from index.css. `motion` wants seconds
 * and a bezier array, so the CSS custom properties cannot be read directly;
 * keep these in sync with index.css.
 *
 * These live here rather than beside the components in `lib/motion.tsx` for the
 * reason `portalRoutes.ts` sits apart from `PortalScope`: a module that exports
 * both a component and a plain value loses Fast Refresh for the component.
 */
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
export const DUR_FAST = 0.12;
export const DUR_BASE = 0.2;
export const DUR_SLOW = 0.38;
