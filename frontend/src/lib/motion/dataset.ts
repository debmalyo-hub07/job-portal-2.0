import type { MotionTier } from "@/components/layout/motionTiers";

import { prefersReduced } from "./reducedMotion";

/**
 * Resolves whether a motion tier is allowed for the element under `el`.
 *
 * This is the imperative counterpart to the CSS resolver: a composable that
 * needs to skip work entirely (rather than just read a collapsed variable)
 * asks here. It walks to the nearest `[data-motion]` ancestor, defaults to the
 * conservative `response` tier when none is set, and stacks the user's
 * reduced-motion preference on top.
 *
 * An element whose PageShell sets nothing behaves as `response` — feedback
 * only. That is the safe default for any surface, including the workspace.
 */
export function motionAllows(el: Element | null, tier: "ambient" | "narrative" | "feedback"): boolean {
  if (tier === "feedback") {
    return true; // Tier 3 is never collapsible.
  }
  if (prefersReduced()) {
    return false; // Tier 1+2 collapse to nothing under the user setting.
  }
  const scope = el?.closest("[data-motion]");
  const value = (scope?.getAttribute("data-motion") as MotionTier | null) ?? "response";
  if (tier === "ambient") return value === "ambient";
  // tier === "narrative": allowed for ambient and standard, not response.
  return value === "ambient" || value === "standard";
}
