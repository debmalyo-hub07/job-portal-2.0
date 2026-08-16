import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Portal } from "@jobportal/shared";
import { useAppSelector } from "@/redux/store";
import { homePathFor, loginPathFor } from "@/lib/portalHome";

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
  const { user, bootstrapped } = useAppSelector((state) => state.auth);
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
  if (user.portal !== portal) {
    return <Navigate to={homePathFor(user.portal)} replace />;
  }
  return <>{children}</>;
};

export default ProtectedRoute;
