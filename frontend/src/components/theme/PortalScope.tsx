import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";

import { portalForPath } from "@/lib/portalRoutes";

/**
 * Sets data-portal from the route only — Portal is a route literal, never
 * derived from request state, a body, a query or a cookie. The signal tokens
 * re-resolve off this attribute; no component branches on the portal to pick a
 * colour.
 *
 * The attribute is written in two places, and both are needed.
 *
 * The wrapper div scopes the app tree, and `/design` relies on the same
 * mechanism to render all three portals side by side on one page;
 * `canvasShader` resolves its hue through `closest("[data-portal]")`.
 *
 * <html> is the second, because a div cannot reach the overlays. Radix renders
 * Dialog, DropdownMenu, Select, Popover, Sheet and Tooltip — and Sonner its
 * toaster — into a portal on document.body, which is a *sibling* of this div
 * rather than a descendant. Inheritance follows the DOM, not the React tree, so
 * an overlay took its signal tokens from <html> and every one of them rendered
 * seeker's teal in the gold workspace and the rose console. <html> is also
 * where next-themes writes the theme class, for exactly this reason.
 *
 * The route→portal mapping lives in `lib/portalRoutes.ts` so the router and the
 * tests can import it without pulling in a component.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const portal = portalForPath(pathname);

  useEffect(() => {
    document.documentElement.dataset.portal = portal;
  }, [portal]);

  return <div data-portal={portal}>{children}</div>;
}
