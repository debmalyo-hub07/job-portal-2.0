import type { ReactNode } from "react";
import { Navigate } from "react-router";
import type { Portal } from "@jobportal/shared";

import { homePathFor } from "@/lib/portalHome";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { portalIsBootstrapped, userForPortal } from "@/redux/authSlice";
import { useAppSelector } from "@/redux/store";

/** Keeps signed-in sessions out of login and signup screens. */
export function GuestRoute({ children, portal }: { children: ReactNode; portal: Portal }) {
  useAuthBootstrap(portal);
  const user = useAppSelector((state) => userForPortal(state.auth, portal));
  const bootstrapped = useAppSelector((state) => portalIsBootstrapped(state.auth, portal));

  // A cached user waits for /me before it can redirect. With no cached user,
  // rendering the public entry immediately avoids a blank first paint for a
  // genuinely anonymous visitor.
  if (!bootstrapped && user) return null;
  if (bootstrapped && user) return <Navigate to={homePathFor(user.portal)} replace />;
  return <>{children}</>;
}

export default GuestRoute;
