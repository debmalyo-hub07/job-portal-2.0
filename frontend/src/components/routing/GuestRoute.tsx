import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { homePathFor } from "@/lib/portalHome";
import { getPortalHint } from "@/lib/portal";
import { useAppSelector } from "@/redux/store";

/** Keeps signed-in sessions out of public entry and authentication screens. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, bootstrapped } = useAppSelector((state) => state.auth);

  // A cached user waits for /me before it can redirect. With no cached user,
  // rendering the public entry immediately avoids a blank first paint for a
  // genuinely anonymous visitor.
  if (!bootstrapped && (user || getPortalHint())) return null;
  if (bootstrapped && user) return <Navigate to={homePathFor(user.portal)} replace />;
  return <>{children}</>;
}

export default GuestRoute;
