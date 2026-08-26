import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";

import { portalForPath } from "@/lib/portalRoutes";

/**
 * Sets data-portal from the route — never from a body, a cookie or session
 * state. The signal tokens re-resolve off this attribute; no component branches
 * on the portal to pick a colour.
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
 *
 * `search` is passed alongside `pathname` for the seven portal-neutral auth
 * paths, which name no portal and carry it in `?portal=` — see `portalForPath`.
 * Without it those pages resolved `seeker` and painted teal over recruiter and
 * admin copy. The param is consulted on those seven paths only, so a
 * hand-edited `?portal=` cannot repaint the workspace or the console.
 */
export function PortalScope({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const portal = portalForPath(pathname, search);

  useEffect(() => {
    document.documentElement.dataset.portal = portal;
  }, [portal]);

  return <div data-portal={portal}>{children}</div>;
}
