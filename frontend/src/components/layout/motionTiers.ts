import type { CSSProperties } from "react";

/** Motion budget for the surface, resolved exactly like density. */
export type MotionTier = "ambient" | "standard" | "response";

/**
 * The surface's motion vocabulary, inlined as CSS custom properties.
 *
 * Why this is a plain data module rather than part of `PageShell.tsx`: a file
 * exporting both a component and a runtime constant loses Fast Refresh for the
 * component, the same reason `portalRoutes.ts` and `siteNav.ts` sit apart from
 * the components that read them. `MotionTier` is a type and would have been
 * safe to leave (types erase), but the two belong together — the type names the
 * tiers, this map is what each one means.
 *
 * Why inline properties at all: vitest's jsdom does not process Tailwind 4's
 * modern CSS (nesting, @theme), so a `[data-motion]` attribute resolver never
 * materialises custom properties in tests and the tier contract would be
 * unassertable. jsdom reads inline custom properties on computed style, and a
 * real browser resolves them identically — inline is the form that makes the
 * contract testable rather than duplicated. (Tokens, not hex; this isn't colour.)
 *
 * Why `var()` for the reducible tier variables instead of literals: the values
 * ambient and standard actually ship must collapse under the user's
 * `prefers-reduced-motion` setting, and index.css owns that single collapse.
 * Pointing the reveal distance, parallax and ambient switches at the :root
 * variables (`--motion-distance`, `--motion-parallax`, `--motion-ambient`) lets
 * one @media block collapse them for every surface without any component code
 * passing a flag. Response's literals are zero/one because nothing about them is
 * reducible. Reveal opacity and feedback scale are literals in every tier:
 * neither is ever reduced.
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
export const MOTION_VARS: Record<MotionTier, CSSProperties> = {
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
    // Quarter amplitude, and nothing on the workspace reads it yet — no surface
    // running this tier mounts an Atmosphere. The value exists so the tier scale
    // is complete rather than having a hole: if the workspace ever takes one, a
    // whisper is the right size for a surface where a data table is the subject.
    // Until something mounts one, this line is a declaration, not a behaviour.
    "--motion-ambient-amplitude": "calc(var(--motion-ambient) * 0.25)",
    "--motion-feedback-scale": 1,
  } as CSSProperties,
};
