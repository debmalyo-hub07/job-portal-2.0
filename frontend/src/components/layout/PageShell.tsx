import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Density = "spacious" | "compact";
type Width = "narrow" | "default" | "wide" | "prose";
/** Motion budget for the surface, resolved exactly like density. */
export type MotionTier = "ambient" | "standard" | "response";

const WIDTH: Record<Width, string> = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  // A reading measure for long-form text: max-w-prose (65ch) keeps a line from
  // running past the comfortable reading length on a wide screen.
  prose: "max-w-prose",
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
 *
 * Why the parallax and ambient variables are RENAMED here
 * (`--motion-parallax-depth`, `--motion-ambient-amplitude`) rather than declared
 * under their :root names: a custom property cannot reference itself
 * (`--motion-parallax: var(--motion-parallax)` is a cycle and resolves to
 * empty), and `calc(var(--motion-parallax) * 0.5)` inherits that cycle, so the
 * same-name form was dead on every surface from 4A.1 until Phase 5 — it read
 * `""`, and a consumer parsing that got `NaN`. The scale step in the standard
 * and response tiers needs the tier-scoped variable to refer to the :root one,
 * which requires the two to have different names. The :root names stay the
 * reducible switches; the tier-scoped names carry the resolved value.
 */
const MOTION_VARS: Record<MotionTier, CSSProperties> = {
  ambient: {
    "--motion-reveal-opacity": 1,
    "--motion-reveal-distance": "var(--motion-distance)",
    "--motion-parallax-depth": "var(--motion-parallax)",
    "--motion-ambient-amplitude": "var(--motion-ambient)",
    "--motion-feedback-scale": 1,
  } as CSSProperties,
  standard: {
    "--motion-reveal-opacity": 1,
    "--motion-reveal-distance": "var(--motion-distance)",
    "--motion-parallax-depth": "var(--motion-parallax)",
    // Half amplitude: browse and detail carry atmosphere, but it sits behind
    // content someone is reading rather than behind a headline.
    "--motion-ambient-amplitude": "calc(var(--motion-ambient) * 0.5)",
    "--motion-feedback-scale": 1,
  } as CSSProperties,
  response: {
    "--motion-reveal-opacity": 1,
    "--motion-reveal-distance": "0px",
    "--motion-parallax-depth": 0,
    // A whisper, not nothing. Phase 5 extends atmosphere to the workspace and
    // console, reversing 4A's success criterion 6. Quarter amplitude and no
    // parallax: enough that the surface is not inert, little enough that it
    // never competes with a data table for attention.
    "--motion-ambient-amplitude": "calc(var(--motion-ambient) * 0.25)",
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
