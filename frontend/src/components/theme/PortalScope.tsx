import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { portalForPath } from "@/lib/portalRoutes";

/**
 * Sets data-portal from the route only — Portal is a route literal, never
 * derived from request state, a body, a query or a cookie. The signal tokens
 * re-resolve off this attribute; no component branches on the portal to pick a
 * colour.
 *
 * The route→portal mapping lives in `lib/portalRoutes.ts` so the router and the
 * tests can import it without pulling in a component.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div data-portal={portalForPath(pathname)}>{children}</div>;
}
