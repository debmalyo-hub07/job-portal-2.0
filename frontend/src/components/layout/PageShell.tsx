import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MOTION_VARS, type MotionTier } from "./motionTiers";

type Density = "spacious" | "compact";
type Width = "narrow" | "default" | "wide" | "prose";

const WIDTH: Record<Width, string> = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  // A reading measure for long-form text: max-w-prose (65ch) keeps a line from
  // running past the comfortable reading length on a wide screen.
  prose: "max-w-prose",
};

/**
 * The page container. Sets `data-density` and `data-motion`, which is what the
 * spacing and motion custom properties resolve from — the same mechanism
 * `data-portal` uses for signal colour, so a component reads the resolved
 * custom property and never asks which surface it is on.
 *
 * Density follows the surface's job, not the portal: /hire is recruiter-scoped
 * but is a marketing page, so it runs spacious.
 *
 * Motion likewise follows the surface's distance from the work:
 * `ambient` for marketing, `standard` for browse and detail, `response` for
 * the workspace. Omitting `motion` renders no attribute, which resolves to the
 * safest, most conservative tier. Tier 3 (feedback) survives every tier and is
 * never collapsible; only ambient and narrative motion yield to
 * `prefers-reduced-motion` (see index.css).
 */
export function PageShell({
  density = "spacious",
  width = "default",
  motion,
  className,
  children,
}: {
  density?: Density;
  width?: Width;
  motion?: MotionTier;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-density={density}
      data-motion={motion}
      style={motion ? MOTION_VARS[motion] : undefined}
      className="min-h-screen bg-paper text-ink"
    >
      <div
        className={cn(
          "mx-auto px-4 pt-(--space-page-top) pb-(--space-section) sm:px-6",
          WIDTH[width],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default PageShell;
