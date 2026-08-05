import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { Portal } from "@jobportal/shared";

/** Route prefixes that resolve to the recruiter portal. */
const RECRUITER_PREFIXES = ["/hire", "/admin"] as const;

/**
 * The portal a pathname belongs to.
 *
 * Exported so the router and the tests share one definition — two copies of
 * this mapping would drift, and the drift is invisible until a page renders the
 * wrong signal colour against the right endpoint.
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

/**
 * Sets data-portal from the route only — Portal is a route literal, never
 * derived from request state, a body, a query or a cookie. The signal tokens
 * re-resolve off this attribute; no component branches on the portal to pick a
 * colour.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div data-portal={portalForPath(pathname)}>{children}</div>;
}
