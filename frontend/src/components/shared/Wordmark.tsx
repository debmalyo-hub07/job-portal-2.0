import { Link } from "react-router";
import type { Portal } from "@jobportal/shared";

import { cn } from "@/lib/utils";

/**
 * The platform's name and mark.
 *
 * One component because there were two hand-written copies — the navbar's and
 * `AuthLayout`'s — which is how the navbar kept rendering an `<h1>` for a year
 * after the auth layout had settled on a `<span>`. A site identifier is not the
 * heading of the page it happens to sit on; as an `<h1>` it gave every route two
 * competing top-level headings, so a screen-reader user navigating by heading
 * hit the site name before the page's own title every time.
 *
 * A cairn is a stack of stones one traveller leaves to mark the path for the
 * next, which is the product in one object. The mark is drawn rather than
 * imported so the top stone can take `--signal` and recolour per portal for
 * free — the same mechanism `PortalScope` drives everywhere else.
 *
 * The suffix names the surface, not the brand: seekers see the bare wordmark
 * because the public board is the default face of the product, and the two
 * signed-in surfaces qualify it.
 */
const SUFFIX: Record<Portal, string | null> = {
  seeker: null,
  recruiter: "Hire",
  admin: "Console",
};

export function CairnMark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "media";
}) {
  const inkClass = tone === "media" ? "fill-media-copy" : "fill-ink";

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      fill="none"
    >
      {/* Three stones, narrowing upward. The top one carries the portal signal;
          the two below are ink, so the mark still reads at 16px in monochrome. */}
      <ellipse cx="12" cy="19.5" rx="8.5" ry="3" className={inkClass} />
      <ellipse cx="12" cy="13.5" rx="6" ry="2.75" className={inkClass} />
      <ellipse cx="12" cy="7.75" rx="3.75" ry="2.5" className={tone === "media" ? "fill-signal" : "fill-signal-text"} />
    </svg>
  );
}

export function Wordmark({
  portal = "seeker",
  to,
  className,
  tone = "default",
}: {
  portal?: Portal;
  /** Where the mark navigates. Omit to render the lockup without a link. */
  to?: string;
  className?: string;
  tone?: "default" | "media";
}) {
  const suffix = SUFFIX[portal];
  const primaryText = tone === "media" ? "text-media-copy" : "text-ink";
  const secondaryText = tone === "media" ? "text-media-copy/65" : "text-ink-muted";
  const signalText = tone === "media" ? "text-signal" : "text-signal-text";

  const lockup = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <CairnMark className="size-7" tone={tone} />
      <span className={cn("font-display font-semibold", primaryText)}>
        Cairn
        {suffix ? (
          <>
            <span aria-hidden="true" className={cn("mx-1 font-normal", secondaryText)}>
              /
            </span>
            <span className={signalText}>{suffix}</span>
          </>
        ) : null}
      </span>
    </span>
  );

  // `viewTransition` unconditionally: the lockup only becomes a link on
  // surfaces where following it changes the page (a portal home), which is
  // exactly the class of navigation the cross-fade exists for.
  return to ? (
    <Link
      to={to}
      viewTransition
      className="inline-block rounded-sharp outline-none focus-visible:ring-[3px] focus-visible:ring-signal-ring"
    >
      {lockup}
    </Link>
  ) : (
    lockup
  );
}

export default Wordmark;
