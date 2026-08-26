import type { ReactNode } from "react";
import { Navigate } from "react-router";
import type { Portal } from "@jobportal/shared";

import { landingAfterAuth } from "@/lib/portalHome";
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
  // `landingAfterAuth`, not `homePathFor`. This redirect fires the moment `setUser`
  // lands — while the login screen it guards is still mounted — so it RACES and
  // wins against the navigation Login just issued. With `homePathFor` it sent every
  // freshly signed-in account to the board, overriding the completion step: the
  // identity gate was reachable only by typing its URL. jsdom cannot see this,
  // because no jsdom test signs in through the real form and then observes where
  // the guard above it lands.
  if (bootstrapped && user) return <Navigate to={landingAfterAuth(user)} replace />;
  return <>{children}</>;
}

export default GuestRoute;
