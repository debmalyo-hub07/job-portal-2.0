import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Density = "spacious" | "compact";
type Width = "narrow" | "default" | "wide";
/** Motion budget for the surface, resolved exactly like density. */
export type MotionTier = "ambient" | "standard" | "response";

const WIDTH: Record<Width, string> = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

/**
 * The surface's motion vocabulary, inlined as CSS custom properties.
 *
 * Why inline: vitest's jsdom does not process Tailwind 4's modern CSS
 * (nesting, @theme), so a `[data-motion]` attribute resolver never materialises
 * custom properties in tests and the tier contract would be unassertable.
 * jsdom reads inline custom properties on computed style, and a real browser
 * resolves them identically — inline is the form that makes the contract
 * testable rather than duplicated. (Tokens, not hex; this isn't colour.)
 *
 * Why `var()` for the reducible tier variables instead of literals: the values
 * ambient and standard actually ship must collapse under the user's
 * `prefers-reduced-motion` setting, and index.css owns that single collapse.
 * Pointing the reveal distance, parallax and ambient switches at the :root
 * variables (`--motion-distance`, `--motion-parallax`, `--motion-ambient`)
 * lets one @media block collapse them for every surface without any component
 * code passing a flag. Response's literals are zero/one because nothing about
 * them is reducible. Reveal opacity and feedback scale are literals in every
 * tier: neither is ever reduced.
 */
const MOTION_VARS: Record<MotionTier, CSSProperties> = {
  ambient: {
    "--motion-reveal-opacity": 1,
    "--motion-reveal-distance": "var(--motion-distance)",
    "--motion-parallax": "var(--motion-parallax)",
    "--motion-ambient": "var(--motion-ambient)",
    "--motion-feedback-scale": 1,
  } as CSSProperties,
  standard: {
    "--motion-reveal-opacity": 1,
    "--motion-reveal-distance": "var(--motion-distance)",
    "--motion-parallax": "var(--motion-parallax)",
    "--motion-ambient": 0,
    "--motion-feedback-scale": 1,
  } as CSSProperties,
  response: {
    "--motion-reveal-opacity": 1,
    "--motion-reveal-distance": "0px",
    "--motion-parallax": 0,
    "--motion-ambient": 0,
    "--motion-feedback-scale": 1,
  } as CSSProperties,
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
          "mx-auto px-6 pt-(--space-page-top) pb-(--space-section)",
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
