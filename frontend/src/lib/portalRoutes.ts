import type { Portal } from "@jobportal/shared";

/**
 * Route prefix → portal.
 *
 * The prefixes are disjoint, so order is not significant, but the
 * segment-boundary match is: a bare `startsWith("/hire")` would claim "/hired",
 * and `startsWith("/admin")` would claim "/administrator". Getting that wrong
 * silently renders one portal's signal colour on another portal's page.
 *
 * `/admin` belongs to the admin portal as of Phase 3A. The recruiter workspace
 * that used to live there moved to `/hire/*`, so the whole recruiter surface —
 * marketing, auth and workspace — now sits under one prefix.
 */
const PREFIXES: ReadonlyArray<readonly [string, Portal]> = [
  ["/admin", "admin"],
  ["/hire", "recruiter"],
];

export function portalForPath(pathname: string): Portal {
  for (const [prefix, portal] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return portal;
  }
  return "seeker";
}
