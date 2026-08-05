import type { Portal } from "@jobportal/shared";

/** Route prefixes that resolve to the recruiter portal. */
const RECRUITER_PREFIXES = ["/hire", "/admin"] as const;

/**
 * The portal a pathname belongs to.
 *
 * In its own module rather than beside `PortalScope`, because a file that
 * exports both a component and a plain function loses Fast Refresh for the
 * component — and this mapping is imported by the router and the tests, so it
 * has more consumers than the component does.
 *
 * Matches on a segment boundary, not a bare prefix: "/hired" and
 * "/administrator" are seeker paths, and `startsWith("/hire")` would claim both.
 */
export function portalForPath(pathname: string): Portal {
  return RECRUITER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "recruiter"
    : "seeker";
}
