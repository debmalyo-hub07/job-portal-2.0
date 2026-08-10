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

export function CairnMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      fill="none"
    >
      {/* Three stones, narrowing upward. The top one carries the portal signal;
          the two below are ink, so the mark still reads at 16px in monochrome. */}
      <ellipse cx="12" cy="19.5" rx="8.5" ry="3" className="fill-ink" />
      <ellipse cx="12" cy="13.5" rx="6" ry="2.75" className="fill-ink" />
      <ellipse cx="12" cy="7.75" rx="3.75" ry="2.5" className="fill-signal-text" />
    </svg>
  );
}

export function Wordmark({
  portal = "seeker",
  to,
  className,
}: {
  portal?: Portal;
  /** Where the mark navigates. Omit to render the lockup without a link. */
  to?: string;
  className?: string;
}) {
  const suffix = SUFFIX[portal];

  const lockup = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CairnMark />
      <span className="font-display font-bold text-ink">
        Cairn
        {suffix ? (
          <>
            <span aria-hidden="true" className="mx-1 font-normal text-ink-muted">
              /
            </span>
            <span className="text-signal-text">{suffix}</span>
          </>
        ) : null}
      </span>
    </span>
  );

  return to ? (
    <Link to={to} className="inline-block">
      {lockup}
    </Link>
  ) : (
    lockup
  );
}

export default Wordmark;
