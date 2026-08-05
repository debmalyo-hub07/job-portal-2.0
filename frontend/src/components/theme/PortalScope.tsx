import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Sets data-portal from the route only — Portal is a route literal, never
 * derived from request state. /admin/* is the recruiter surface; everything
 * else renders with the seeker signal.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const portal = pathname.startsWith("/admin") ? "recruiter" : "seeker";
  return <div data-portal={portal}>{children}</div>;
}
