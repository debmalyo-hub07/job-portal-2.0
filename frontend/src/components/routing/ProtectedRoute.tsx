import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Portal } from "@jobportal/shared";
import { useAppSelector } from "@/redux/store";
import { loginPathFor } from "@/lib/portalHome";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { portalIsBootstrapped, userForPortal } from "@/redux/authSlice";

type ProtectedRouteProps = {
  children: ReactNode;
  /**
   * The portal this subtree belongs to. A route literal, exactly like the API's
   * `authenticate(portal)` — never read from state, a control or the URL. Since
   * Phase 3A there are three portals, so a subtree that assumed "recruiter"
   * would admit an admin to the recruiter workspace.
   */
  portal: Portal;
};

/**
 * Client-side guard only — it hides UI, it does not protect data. Every
 * recruiter and admin route is also authorized server-side.
 */
const ProtectedRoute = ({ children, portal }: ProtectedRouteProps) => {
  useAuthBootstrap(portal);
  const user = useAppSelector((state) => userForPortal(state.auth, portal));
  const bootstrapped = useAppSelector((state) => portalIsBootstrapped(state.auth, portal));
  const location = useLocation();

  if (!bootstrapped) return null;
  if (!user) {
    return (
      <Navigate
        to={loginPathFor(portal)}
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  return <>{children}</>;
};

export default ProtectedRoute;
